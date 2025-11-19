import os
import asyncio
import aiohttp
import shutil
import random
import traceback
import json
from datetime import datetime
from PIL import Image, ImageDraw, ImageFont
from flask import current_app
from flowork.extensions import db
from flowork.models import Product, Setting, Brand
from rembg import remove, new_session

RESAMPLE_LANCZOS = Image.Resampling.LANCZOS

_REMBG_SESSION = None

def _log(message):
    print(f"[{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] [ImageProcess] {message}")

def _get_rembg_session():
    global _REMBG_SESSION
    if _REMBG_SESSION is None:
        model_name = "u2netp"
        _log(f"Initializing Rembg session with model: {model_name}")
        _REMBG_SESSION = new_session(model_name)
    return _REMBG_SESSION

def process_style_code_group(brand_id, style_code):
    products = []
    try:
        _log(f"Start processing group: {style_code} (Brand ID: {brand_id})")
        
        # 브랜드 정보 조회 (폴더명 생성용)
        brand = db.session.get(Brand, brand_id)
        if not brand:
            return False, "브랜드 정보를 찾을 수 없습니다."
        brand_name = brand.brand_name

        products = Product.query.filter_by(brand_id=brand_id).filter(
            Product.product_number.like(f"{style_code}%")
        ).all()
        
        if not products:
            _log(f"No products found for style code: {style_code}")
            return False, "해당 품번의 상품이 없습니다."

        _log(f"Found {len(products)} products for {style_code}")

        variants_map = {}
        for p in products:
            color_name = "UnknownColor"
            if p.variants and len(p.variants) > 0:
                color_name = p.variants[0].color or "UnknownColor"
            
            if color_name not in variants_map:
                variants_map[color_name] = {
                    'product': p,
                    'color_code': color_name,
                    'files': {
                        'DF': [], 
                        'DM': [], 
                        'NOBG': None 
                    }
                }
        
        _log(f"Grouped into {len(variants_map)} colors: {', '.join(variants_map.keys())}")

        if not variants_map:
            msg = "처리할 컬러 옵션을 찾을 수 없습니다."
            _log(msg)
            _update_product_status(products, 'FAILED', msg)
            return False, msg

        # 임시 작업 폴더
        temp_dir = os.path.join(current_app.config['UPLOAD_FOLDER'], 'temp_images', style_code)
        os.makedirs(temp_dir, exist_ok=True)
        _log(f"Created temp directory: {temp_dir}")

        patterns_config = _get_brand_url_patterns(brand_id)
        if not patterns_config:
             msg = "이미지 다운로드 URL 패턴 설정이 없습니다."
             _log(msg)
             _update_product_status(products, 'FAILED', msg)
             return False, msg

        _log("Starting asynchronous image download...")
        asyncio.run(_download_all_variants(style_code, variants_map, patterns_config, temp_dir))
        _log("Download finished.")

        valid_variants = []
        for color_name, data in variants_map.items():
            if data['files']['DF']:
                rep_image_path = data['files']['DF'][0]
                _log(f"Removing background for {color_name}: {os.path.basename(rep_image_path)}")
                nobg_path = _remove_background(rep_image_path)
                if nobg_path:
                    data['files']['NOBG'] = nobg_path
                    valid_variants.append(data)
            elif data['files']['DM']:
                 _log(f"No DF image for {color_name}, but DM exists. Using DM only.")
                 valid_variants.append(data)

        if not valid_variants:
            msg = "유효한 이미지를 하나도 다운로드하지 못했습니다."
            _log(msg)
            _update_product_status(products, 'FAILED', msg)
            return False, msg

        _log("Creating thumbnail and detail images...")
        thumbnail_path = _create_thumbnail(valid_variants, temp_dir, style_code)
        detail_path = _create_detail_image(valid_variants, temp_dir, style_code)

        # 로컬 서버 저장소로 이동 (요청하신 구조 반영)
        _log("Saving files to local server storage...")
        result_links = _save_structure_locally(brand_name, style_code, variants_map, thumbnail_path, detail_path)
        _log("Save successful.")

        _log("Updating database with results...")
        _update_product_db(products, result_links)
        
        # 임시 폴더 정리
        try:
            shutil.rmtree(temp_dir)
        except:
            pass

        _log(f"Completed processing for {style_code}")
        return True, f"성공: {len(valid_variants)}개 컬러 처리 완료"

    except Exception as e:
        err_msg = f"시스템 오류: {str(e)}\n{traceback.format_exc()}"
        _log(f"Fatal Error: {err_msg}")
        if products:
            _update_product_status(products, 'FAILED', f"오류 발생: {str(e)}")
        return False, f"오류 발생: {str(e)}"

def _update_product_status(products, status, message=None):
    try:
        for p in products:
            p.image_status = status
            if message:
                p.last_message = message
        db.session.commit()
    except:
        db.session.rollback()

def _update_product_db(products, links):
    try:
        updated_count = 0
        for p in products:
            db.session.refresh(p)
            if p.image_status != 'PROCESSING':
                continue

            p.image_status = 'COMPLETED'
            p.last_message = '처리 완료'
            
            if 'thumbnail' in links:
                p.thumbnail_url = links['thumbnail']
            if 'colordetail' in links:
                p.detail_image_url = links['colordetail']
            
            # 로컬 경로는 드라이브 링크 필드 대신 별도로 처리하거나, 
            # 필요하다면 해당 폴더로 바로가는 내부 링크를 저장할 수도 있습니다.
            # 여기서는 개별 폴더 링크는 생략합니다.
            
            updated_count += 1

        if updated_count > 0:
            db.session.commit()
    except Exception as e:
        _log(f"DB Update Failed: {e}")
        db.session.rollback()

def _load_brand_config_from_file(brand_id):
    try:
        brand = db.session.get(Brand, brand_id)
        if not brand: return None
        
        json_path = os.path.join(current_app.root_path, 'brands', f'{brand.brand_name}.json')
        if os.path.exists(json_path):
            with open(json_path, 'r', encoding='utf-8') as f:
                return json.load(f)
    except Exception as e:
        _log(f"Config load error for brand {brand_id}: {e}")
    return None

def _get_brand_url_patterns(brand_id):
    setting = Setting.query.filter_by(brand_id=brand_id, key='IMAGE_DOWNLOAD_PATTERNS').first()
    if setting and setting.value:
        try:
            return json.loads(setting.value)
        except:
            pass
    config = _load_brand_config_from_file(brand_id)
    if config:
        return config.get('IMAGE_DOWNLOAD_PATTERNS', {})
    return {}

async def _download_all_variants(style_code, variants_map, patterns_config, save_dir):
    connector = aiohttp.TCPConnector(limit=10)
    async with aiohttp.ClientSession(connector=connector) as session:
        tasks = []
        year = ""
        if len(style_code) >= 5 and style_code[3:5].isdigit():
            year = "20" + style_code[3:5]

        for color_name, data in variants_map.items():
            p_num = data['product'].product_number
            c_code = color_name.strip() if color_name and color_name != "UnknownColor" else ""
            full_code = f"{p_num}{c_code}"
            
            color_dir = os.path.join(save_dir, color_name)
            os.makedirs(color_dir, exist_ok=True)

            if 'DF' in patterns_config:
                tasks.append(_download_sequence(session, full_code, year, patterns_config['DF'], color_dir, 'DF', data))
            if 'DM' in patterns_config:
                tasks.append(_download_sequence(session, full_code, year, patterns_config['DM'], color_dir, 'DM', data))
            if 'DG' in patterns_config:
                tasks.append(_download_sequence(session, full_code, year, patterns_config['DG'], color_dir, 'DG', data))
        await asyncio.gather(*tasks)

async def _download_sequence(session, code, year, patterns, save_dir, img_type, data_ref):
    num = 1
    consecutive_failures = 0
    while True:
        found_any_pattern = False
        num_formats = [f"{num:02d}", f"{num}", f"{num:03d}"]
        for num_fmt in num_formats: 
            for pattern in patterns:
                url = pattern.format(year=year, code=code, num=num_fmt)
                try:
                    async with session.get(url, timeout=10) as response:
                        if response.status == 200:
                            content = await response.read()
                            ext = ".jpg"
                            if url.lower().endswith(".png"): ext = ".png"
                            elif url.endswith(".JPG"): ext = ".JPG"
                            
                            filename = f"{code}_{img_type}_{num_fmt}{ext}"
                            save_path = os.path.join(save_dir, filename)
                            
                            with open(save_path, 'wb') as f:
                                f.write(content)
                            
                            data_ref['files'][img_type].append(save_path)
                            found_any_pattern = True
                            _log(f"Downloaded: {filename}")
                            break 
                except:
                    continue
            if found_any_pattern: break
        if found_any_pattern:
            num += 1
            consecutive_failures = 0
        else:
            consecutive_failures += 1
            if consecutive_failures >= 1: 
                break

def _remove_background(input_path):
    try:
        name, ext = os.path.splitext(input_path)
        output_path = f"{name}_nobg.png"
        
        model_home = '/app/models'
        os.environ['U2NET_HOME'] = model_home
        os.makedirs(model_home, exist_ok=True)

        session = _get_rembg_session()

        with open(input_path, 'rb') as i:
            with open(output_path, 'wb') as o:
                input_data = i.read()
                output_data = remove(input_data, session=session)
                o.write(output_data)
        return output_path
    except Exception as e:
        _log(f"Rembg error for {input_path}: {e}")
        return None

def _create_thumbnail(variants, temp_dir, style_code):
    try:
        canvas_size = 800
        canvas = Image.new("RGBA", (canvas_size, canvas_size), (255, 255, 255, 255))
        images = []
        for v in variants:
            if v['files']['NOBG']:
                img = Image.open(v['files']['NOBG']).convert("RGBA")
                images.append(img)
        if not images: return None

        count = len(images)
        grid_layout = _get_grid_layout(count)
        cell_size = canvas_size // 2 
        
        for idx, img in enumerate(images):
            if idx >= len(grid_layout): break
            row, col = grid_layout[idx]
            target_h = int(canvas_size * 0.55) 
            width, height = img.size
            ratio = target_h / height
            new_w = int(width * ratio)
            new_h = int(height * ratio)
            resized = img.resize((new_w, new_h), RESAMPLE_LANCZOS)
            
            cx = int(col * cell_size + cell_size / 2)
            cy = int(row * cell_size + cell_size / 2)
            x = cx - new_w // 2
            y = cy - new_h // 2
            
            jitter_x = random.randint(-10, 10)
            jitter_y = random.randint(-10, 10)
            canvas.alpha_composite(resized, (x + jitter_x, y + jitter_y))
            
        output_path = os.path.join(temp_dir, f"{style_code}_thumbnail.png")
        canvas.save(output_path)
        return output_path
    except Exception as e:
        _log(f"Thumbnail creation error: {e}")
        return None

def _get_grid_layout(count):
    if count == 1: return [(0.5, 0.5)] 
    if count == 2: return [(0.5, 0), (0.5, 1)]
    if count == 3: return [(0, 0.5), (1, 0), (1, 1)]
    layout = []
    for r in range(2):
        for c in range(2):
            layout.append((r, c))
    return layout

def _create_detail_image(variants, temp_dir, style_code):
    try:
        width = 800
        item_height = 800
        total_height = item_height * len(variants)
        canvas = Image.new("RGBA", (width, total_height), (255, 255, 255, 255))
        draw = ImageDraw.Draw(canvas)
        try:
            font = ImageFont.truetype("arial.ttf", 40)
        except:
            font = ImageFont.load_default()

        for idx, v in enumerate(variants):
            if not v['files']['NOBG']: continue
            img = Image.open(v['files']['NOBG']).convert("RGBA")
            w, h = img.size
            ratio = (item_height - 100) / h
            new_w = int(w * ratio)
            new_h = int(h * ratio)
            resized = img.resize((new_w, new_h), RESAMPLE_LANCZOS)
            y_offset = idx * item_height
            x_pos = (width - new_w) // 2
            y_pos = y_offset + 50
            canvas.alpha_composite(resized, (x_pos, y_pos))
            
            text = f"COLOR: {v['color_code']}"
            bbox = draw.textbbox((0, 0), text, font=font)
            text_w = bbox[2] - bbox[0]
            draw.text(((width - text_w) // 2, y_offset + item_height - 60), text, fill="black", font=font)
            
        output_path = os.path.join(temp_dir, f"{style_code}_detail.png")
        canvas.save(output_path)
        return output_path
    except Exception as e:
        _log(f"Detail image creation error: {e}")
        return None

def _save_structure_locally(brand_name, style_code, variants_map, thumb_path, detail_path):
    """
    요청하신 구조로 로컬 서버에 저장합니다.
    Root: static/product_images/
    Structure:
      - {Brand}/{Pn}/{Color}/ORIGINAL/
      - {Brand}/{Pn}/{Color}/NOBG/
      - {Brand}/{Pn}/THUMBNAIL/
      - {Brand}/{Pn}/COLORDETAIL/
      - {Brand}/{Pn}/DETAIL/
    """
    base_static_path = os.path.join(current_app.root_path, 'static', 'product_images')
    
    # 브랜드명/품번 폴더 (예: flowork/static/product_images/아이더/DMM25201)
    product_base_dir = os.path.join(base_static_path, brand_name, style_code)
    
    # 각 카테고리 폴더 미리 생성
    thumb_dir = os.path.join(product_base_dir, 'THUMBNAIL')
    colordetail_dir = os.path.join(product_base_dir, 'COLORDETAIL')
    detail_dir = os.path.join(product_base_dir, 'DETAIL')
    
    os.makedirs(thumb_dir, exist_ok=True)
    os.makedirs(colordetail_dir, exist_ok=True)
    os.makedirs(detail_dir, exist_ok=True)
    
    result = {'thumbnail': None, 'colordetail': None}

    # 1. 썸네일 저장
    if thumb_path and os.path.exists(thumb_path):
        dest_thumb = os.path.join(thumb_dir, f"{style_code}_thumb.png")
        shutil.copy2(thumb_path, dest_thumb)
        result['thumbnail'] = f"/static/product_images/{brand_name}/{style_code}/THUMBNAIL/{style_code}_thumb.png"
        
    # 2. 상세 컬러 가이드 저장 (COLORDETAIL)
    if detail_path and os.path.exists(detail_path):
        dest_detail = os.path.join(colordetail_dir, f"{style_code}_colordetail.png")
        shutil.copy2(detail_path, dest_detail)
        result['colordetail'] = f"/static/product_images/{brand_name}/{style_code}/COLORDETAIL/{style_code}_colordetail.png"
        
    # 3. 컬러별 원본(ORIGINAL) 및 누끼(NOBG) 저장
    for color_name, data in variants_map.items():
        color_base_dir = os.path.join(product_base_dir, color_name)
        original_dir = os.path.join(color_base_dir, 'ORIGINAL')
        nobg_dir = os.path.join(color_base_dir, 'NOBG')
        
        os.makedirs(original_dir, exist_ok=True)
        os.makedirs(nobg_dir, exist_ok=True)
        
        # DF 파일 저장 (ORIGINAL)
        for path in data['files']['DF']:
            filename = os.path.basename(path)
            shutil.copy2(path, os.path.join(original_dir, filename))
            
        # DM 파일 저장 (ORIGINAL - 필요 시)
        for path in data['files']['DM']:
            filename = os.path.basename(path)
            shutil.copy2(path, os.path.join(original_dir, filename))
            
        # 배경 제거 이미지 저장 (NOBG)
        if data['files']['NOBG'] and os.path.exists(data['files']['NOBG']):
            filename = os.path.basename(data['files']['NOBG'])
            shutil.copy2(data['files']['NOBG'], os.path.join(nobg_dir, filename))

    return result
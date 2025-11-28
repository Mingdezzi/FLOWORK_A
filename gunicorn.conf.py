import os
import multiprocessing

bind = "0.0.0.0:5000"
backlog = 2048

workers = 5
worker_class = 'gthread'
threads = 4

timeout = 120
keepalive = 5

accesslog = '-'
errorlog = '-'
loglevel = 'info'

proc_name = 'flowork_app'

max_requests = 2000
max_requests_jitter = 100

raw_env = [
    "TZ=Asia/Seoul"
]
# Configuração Gunicorn para Adorefy
bind = "0.0.0.0:5000"
workers = 3
threads = 2
timeout = 120
worker_class = "sync"
accesslog = "-"
errorlog = "-"
loglevel = "info"
keepalive = 5

global:
  resolve_timeout: 5m

  smtp_smarthost: smtp.yandex.ru:587
  smtp_from: ???
  smtp_auth_username: ???
  smtp_auth_password: ???
  smtp_require_tls: true

route:
  receiver: default 

  group_by:
    - alertname
    - instance
    - name

  group_wait: 10s
  group_interval: 1m
  repeat_interval: 1h

receivers:
  - name: default
    
    email_configs:
      - to: ???
        send_resolved: true
        headers:
          Subject: '{{ if eq .Status "firing" }}🚨{{ else }}✅{{ end }} [{{ .CommonLabels.severity | toUpper }}] {{ .CommonAnnotations.summary }}'
    
    telegram_configs:
      - bot_token: ???
        chat_id: ???
        send_resolved: true
        message: |
          {{ if eq .Status "firing" }}🚨{{ else }}✅ FIXED{{ end }} {{ .CommonAnnotations.summary }}
          
          Severity: {{ .CommonLabels.severity }}
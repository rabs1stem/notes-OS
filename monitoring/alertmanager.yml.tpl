global:
  resolve_timeout: 5m

  smtp_smarthost: smtp.yandex.ru:587
  smtp_from: $(...@yandex.ru)
  smtp_auth_username: $(...@yandex.ru)
  smtp_auth_password: $(pass)
  smtp_require_tls: true

route:
  receiver: email

  group_by:
    - alertname
    - instance
    - name

  group_wait: 10s
  group_interval: 1m
  repeat_interval: 1h

receivers:
  - name: email
    email_configs:
      - to: $(...@yandex.ru)
      headers:
          Subject: '[{{ .Status | toUpper }}][{{ .CommonLabels.severity | toUpper }}] {{ .CommonAnnotations.summary }}'
        send_resolved: true
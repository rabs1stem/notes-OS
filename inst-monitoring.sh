#!/usr/bin/env bash

set -e

NAMESPACE="monitoring"
RELEASE="monitoring"
PORT="3000"

echo "Установка kube-prometheus-stack..."

helm repo add prometheus-community https://prometheus-community.github.io/helm-charts >/dev/null 2>&1 || true
helm repo update >/dev/null

helm upgrade --install "${RELEASE}" prometheus-community/kube-prometheus-stack \
  --namespace "${NAMESPACE}" \
  --create-namespace \
  --wait \
  --timeout 15m

PASSWORD=$(kubectl get secret ${RELEASE}-grafana \
  -n ${NAMESPACE} \
  -o jsonpath="{.data.admin-password}" | base64 -d)

pkill -f "port-forward.*${RELEASE}-grafana" >/dev/null 2>&1 || true

kubectl port-forward \
  svc/${RELEASE}-grafana \
  ${PORT}:80 \
  -n ${NAMESPACE} \
  >/dev/null 2>&1 &

sleep 2

clear

echo
echo "╔══════════════════════════════════════════════╗"
echo "║         МОНИТОРИНГ УСПЕШНО ЗАПУЩЕН           ║"
echo "╚══════════════════════════════════════════════╝"
echo
echo "URL      : http://localhost:3000"
echo "Login    : admin"
echo "Password : $PASSWORD"
echo
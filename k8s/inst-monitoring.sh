#!/usr/bin/env bash

set -euo pipefail

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

NAMESPACE="monitoring"
RELEASE="monitoring"
STORAGE_CLASS=$(kubectl get storageclass -o jsonpath='{.items[0].metadata.name}')
GRAFANA_PORT="3000"
PROMETHEUS_PORT="9090"

banner() {
clear

echo -e "${GREEN}"

cat << EOF

██╗  ██╗ █████╗ ███████╗
██║ ██╔╝██╔══██╗██╔════╝
█████╔╝ ╚█████╔╝███████╗
██╔═██╗ ██╔══██╗╚════██║
██║  ██╗╚█████╔╝███████║
╚═╝  ╚═╝ ╚════╝ ╚══════╝

      MONITORING PLATFORM

EOF

echo -e "${GREEN}"
}

step() {
    echo
    echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${YELLOW}▶ $1${NC}"
    echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
}

retry() {
    local attempts=5
    local count=1

    until "$@"; do
        if [ $count -ge $attempts ]; then
            echo
            echo "FAILED AFTER $attempts ATTEMPTS"
            exit 1
        fi

        echo
        echo "Retry $count/$attempts in 15 seconds..."
        sleep 15

        count=$((count + 1))
    done
}

clear
banner

step "ADD HELM REPOSITORIES"

helm repo add prometheus-community https://prometheus-community.github.io/helm-charts || true
helm repo add grafana https://grafana.github.io/helm-charts || true

step "UPDATE HELM REPOSITORIES"

retry helm repo update

step "INSTALL KUBE-PROMETHEUS-STACK"

retry helm upgrade --install "${RELEASE}" \
prometheus-community/kube-prometheus-stack \
--namespace "${NAMESPACE}" \
--create-namespace \
--set grafana.sidecar.datasources.enabled=true \
--wait \
--timeout 30m

step "FIX COREDNS"

if ! kubectl get cm coredns -n kube-system -o yaml | grep -q "1.1.1.1"; then

  kubectl get cm coredns -n kube-system -o yaml \
  | sed 's|forward \. /etc/resolv.conf {|forward . 1.1.1.1 8.8.8.8 {|' \
  | kubectl apply -f -

  kubectl rollout restart deployment coredns -n kube-system

  kubectl rollout status deployment coredns \
  -n kube-system \
  --timeout=5m
fi

step "INSTALL BLACKBOX EXPORTER"

retry helm upgrade --install blackbox-exporter \
prometheus-community/prometheus-blackbox-exporter \
--namespace "${NAMESPACE}" \
--wait \
--timeout 30m

step "INSTALL REDIS EXPORTER"

retry helm upgrade --install redis-exporter \
prometheus-community/prometheus-redis-exporter \
--namespace "${NAMESPACE}" \
--set redisAddress=redis://redis-service.note.svc.cluster.local:6379 \
--set serviceMonitor.enabled=true \
--wait \
--timeout 30m

step "INSTALL POSTGRES EXPORTER"

retry helm upgrade --install postgres-exporter \
prometheus-community/prometheus-postgres-exporter \
--namespace "${NAMESPACE}" \
--set serviceMonitor.enabled=true \
--set config.datasource.host=postgres-service.note.svc.cluster.local \
--set-string config.datasource.port="5432" \
--set config.datasource.user=postgres \
--set config.datasource.password=postgres \
--set config.datasource.database=postgres \
--wait \
--timeout 30m

step "ADD PROMETHEUS LABELS"

kubectl label servicemonitor \
redis-exporter-prometheus-redis-exporter \
-n monitoring \
release=monitoring \
--overwrite || true

kubectl label servicemonitor \
postgres-exporter-prometheus-postgres-exporter \
-n monitoring \
release=monitoring \
--overwrite || true

step "RESTART PROMETHEUS"

kubectl rollout restart statefulset \
prometheus-monitoring-kube-prometheus-prometheus \
-n monitoring

kubectl rollout status statefulset \
prometheus-monitoring-kube-prometheus-prometheus \
-n monitoring \
--timeout=10m

step "ON METRICS INGRESS-NGINX"

retry helm upgrade ingress-nginx ingress-nginx/ingress-nginx \
  -n ingress-nginx \
  --reuse-values \
  --set controller.metrics.enabled=true \
  --set controller.metrics.serviceMonitor.enabled=true \
  --set controller.metrics.serviceMonitor.additionalLabels.release=monitoring \
  --timeout 10m

step "INSTALL LOKI"

helm uninstall loki -n "${NAMESPACE}" >/dev/null 2>&1 || true

kubectl delete pvc storage-loki-0 \
  -n "${NAMESPACE}" \
  --ignore-not-found=true

retry helm upgrade --install loki \
grafana/loki-stack \
--namespace "${NAMESPACE}" \
--set grafana.enabled=false \
--set prometheus.enabled=false \
--set loki.persistence.enabled=true \
--set loki.persistence.storageClassName=${STORAGE_CLASS} \
--set loki.persistence.size=5Gi \
--wait \
--timeout 15m

step "WAIT FOR EXPORTERS"

kubectl rollout status \
deployment/redis-exporter-prometheus-redis-exporter \
-n monitoring \
--timeout=5m

kubectl rollout status \
deployment/postgres-exporter-prometheus-postgres-exporter \
-n monitoring \
--timeout=5m

step "GET GRAFANA PASSWORD"

PASSWORD=$(
kubectl get secret ${RELEASE}-grafana \
-n ${NAMESPACE} \
-o jsonpath="{.data.admin-password}" \
| base64 -d
)

step "WAIT FOR GRAFANA"

kubectl rollout status deployment/${RELEASE}-grafana \
-n ${NAMESPACE} \
--timeout=10m

step "START PORT FORWARDS"

pkill -f "port-forward.*grafana" >/dev/null 2>&1 || true
pkill -f "port-forward.*prometheus" >/dev/null 2>&1 || true

nohup kubectl port-forward \
svc/${RELEASE}-grafana \
${GRAFANA_PORT}:80 \
-n ${NAMESPACE} \
>/tmp/grafana-port-forward.log 2>&1 &

nohup kubectl port-forward \
svc/${RELEASE}-kube-prometheus-prometheus \
${PROMETHEUS_PORT}:9090 \
-n ${NAMESPACE} \
>/tmp/prometheus-port-forward.log 2>&1 &

sleep 5

clear

echo -e "${GREEN}"

cat << EOF

╔══════════════════════════════════════════════════════════════╗
║                                                              ║
║                 INSTALLATION COMPLETED                       ║
║                                                              ║
╚══════════════════════════════════════════════════════════════╝

🌐 GRAFANA
   http://localhost:${GRAFANA_PORT}

📈 PROMETHEUS
   http://localhost:${PROMETHEUS_PORT}

👤 USERNAME
   admin

🔑 PASSWORD
   ${PASSWORD}

EOF

echo -e "${YELLOW}"
cat << EOF

             ☁️
         ☁️      ☁️

          \\(•‿•)/

EOF

echo -e "${GREEN}"
echo "      INSTALLATION SUCCESS"

echo -e "${NC}"
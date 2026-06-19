FROM python:3.12-slim-bookworm AS builder
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1
WORKDIR /build
COPY requirements.txt ./
RUN pip install --no-compile --prefix=/install -r requirements.txt
FROM python:3.12-slim-bookworm
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1
WORKDIR /app
COPY --from=builder /install /usr/local
COPY app/backend ./app
COPY /alembic ./alembic
COPY alembic.ini .
RUN apt-get update && apt-get upgrade -y --no-install-recommends \
&& groupadd --system --gid 1001 app && useradd --system --uid 1001 --gid 1001 app \
&& mkdir -p /app/data && chown -R 1001:1001 ./ \
&& rm -rf /var/lib/apt/lists/*
USER 1001:1001
EXPOSE 8000
HEALTHCHECK --interval=20s --timeout=5s --start-period=7s --retries=3 \
CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/health')"
CMD ["gunicorn", "app.main:app", "-k", "uvicorn.workers.UvicornWorker", "--bind", "0.0.0.0:8000", "--workers", "1"]

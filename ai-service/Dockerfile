# SkinSentry AI Service Dockerfile
# CPU PyTorch by default. For CUDA GPU deployment, replace base with:
# nvidia/cuda:12.1.0-runtime-ubuntu22.04 or pytorch/pytorch:2.3.0-cuda12.1-cudnn8-runtime

FROM python:3.11-slim

WORKDIR /app

# System dependencies for OpenCV, libgomp, and build essentials
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libgl1 \
    libglib2.0-0 \
    libgomp1 \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Install PyTorch CPU wheels first for caching
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir torch torchvision --index-url https://download.pytorch.org/whl/cpu

# Install application requirements
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy source code and configuration
COPY app/ ./app/
COPY config/ ./config/

EXPOSE 8000

ENV PYTHONUNBUFFERED=1 \
    DEVICE=cpu \
    LOG_LEVEL=INFO

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD curl -f http://localhost:8000/v1/health || exit 1

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]

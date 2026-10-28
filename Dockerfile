FROM node:24-bookworm-slim AS frontend-build
WORKDIR /build
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

FROM python:3.13-slim
WORKDIR /app
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
COPY backend/requirements.txt ./backend/requirements.txt
RUN pip install --no-cache-dir -r backend/requirements.txt
RUN useradd --create-home --uid 10001 appuser
COPY --chown=appuser:appuser backend/ ./backend/
COPY --from=frontend-build --chown=appuser:appuser /build/dist ./frontend/dist
RUN chown -R appuser:appuser /app/backend
USER appuser
EXPOSE 10000
CMD ["sh", "-c", "exec python -m uvicorn backend.production:app --host 0.0.0.0 --port ${PORT:-10000}"]

FROM python:3.11-slim
WORKDIR /app
COPY services/ml-service/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY services/ml-service/src/ ./src/
CMD ["uvicorn", "src.main:app", "--host", "0.0.0.0", "--port", "8001"]

FROM python:3.11-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Railway uses PORT env variable
ENV PORT=8000
EXPOSE 8000

CMD ["/bin/sh", "-c", "uvicorn main:app --host 0.0.0.0 --port ${PORT}"]

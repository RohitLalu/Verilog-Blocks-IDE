docker compose down
docker build -t verilogblocks .
docker compose up -d

#tool working verification check

curl http://localhost:3000/api/health
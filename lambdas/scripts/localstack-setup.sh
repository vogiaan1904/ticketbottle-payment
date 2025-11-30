#!/bin/bash

set -e

echo "Setting up LocalStack for Lambda testing"

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m' # No Color

cd "$(dirname "$0")/.."

# Load environment variables from .env.payment
ENV_FILE="../../development/envs/.env.payment"
if [ -f "$ENV_FILE" ]; then
  set -a
  source "$ENV_FILE"
  set +a
  echo -e "${GREEN}Loaded credentials from .env.payment${NC}"
else
  echo -e "${YELLOW}.env.payment not found, using defaults${NC}"
fi

# Check if build directory exists
if [ ! -d "build" ]; then
  echo -e "${RED}Build directory not found. Run 'npm run build:layers'${NC}"
  exit 1
fi

# Start LocalStack
echo -e "${YELLOW}Starting LocalStack${NC}"
cd ../../development
docker-compose -f docker-compose.dev.yml up -d localstack
cd ../ticketbottle-payment/lambdas

# Wait for LocalStack to be ready
echo -e "${YELLOW}Waiting for LocalStack${NC}"
sleep 15

# Check LocalStack health
until curl -s http://localhost:4566/_localstack/health | grep -q "running"; do
  echo -e "${YELLOW}Waiting for LocalStack${NC}"
  sleep 5
done

echo -e "${GREEN}LocalStack ready${NC}"

# Check LocalStack Pro is activated
echo -e "${YELLOW}Checking LocalStack Pro${NC}"
EDITION=$(curl -s http://localhost:4566/_localstack/info 2>/dev/null | jq -r '.edition' 2>/dev/null)
IS_ACTIVATED=$(curl -s http://localhost:4566/_localstack/info 2>/dev/null | jq -r '.is_license_activated' 2>/dev/null)

if [ "$EDITION" != "pro" ] || [ "$IS_ACTIVATED" != "true" ]; then
  echo -e "${RED}LocalStack Pro required for Lambda Layers${NC}"
  echo -e "${YELLOW}Edition: ${EDITION:-unknown}${NC}"
  echo -e "${YELLOW}License: ${IS_ACTIVATED:-false}${NC}"
  echo -e "${YELLOW}Set LOCALSTACK_AUTH_TOKEN and restart${NC}"
  exit 1
fi
echo -e "${GREEN}LocalStack Pro active and licensed${NC}"

# Create IAM role
echo -e "${YELLOW}Creating IAM role${NC}"
LAMBDA_ROLE_ARN=$(awslocal iam create-role \
  --role-name ticketbottle-lambda-role \
  --assume-role-policy-document '{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Principal":{"Service":"lambda.amazonaws.com"},"Action":"sts:AssumeRole"}]}' \
  --query 'Role.Arn' \
  --output text 2>/dev/null || awslocal iam get-role --role-name ticketbottle-lambda-role --query 'Role.Arn' --output text)

echo -e "${GREEN}IAM Role: $LAMBDA_ROLE_ARN${NC}"

# Publish layers
echo -e "${YELLOW}Publishing layers${NC}"

DEPENDENCIES_LAYER_ARN=$(awslocal lambda publish-layer-version \
  --layer-name ticketbottle-dependencies \
  --description "Node.js dependencies and Prisma client" \
  --zip-file fileb://build/dependencies-layer.zip \
  --compatible-runtimes nodejs20.x \
  --query 'LayerVersionArn' \
  --output text)

echo -e "${GREEN}Dependencies: $DEPENDENCIES_LAYER_ARN${NC}"

COMMON_LAYER_ARN=$(awslocal lambda publish-layer-version \
  --layer-name ticketbottle-common \
  --description "Common shared code" \
  --zip-file fileb://build/common-layer.zip \
  --compatible-runtimes nodejs20.x \
  --query 'LayerVersionArn' \
  --output text)

echo -e "${GREEN}Common: $COMMON_LAYER_ARN${NC}"

# Create environment files
echo -e "${YELLOW}Creating environment files${NC}"

# Webhook handler env
cat > env.localstack.json <<EOF
{
  "Variables": {
    "NODE_ENV": "development",
    "LOG_LEVEL": "debug",
    "DATABASE_URL": "${DATABASE_URL:-postgresql://root:root@postgres-payment:5432/ticketbottle_payment}",
    "KAFKA_BROKERS": "${KAFKA_BROKERS:-kafka:29092}",
    "KAFKA_SSL": "${KAFKA_SSL:-false}",
    "ZALOPAY_APP_ID": "${ZALOPAY_APP_ID:-test_app_id_123}",
    "ZALOPAY_KEY1": "${ZALOPAY_KEY1:-test_key1_abc}",
    "ZALOPAY_KEY2": "${ZALOPAY_KEY2:-test_key2_xyz}",
    "PAYOS_CLIENT_ID": "${PAYOS_CLIENT_ID:-test_payos_client}",
    "PAYOS_API_KEY": "${PAYOS_API_KEY:-test_payos_key}",
    "PAYOS_CHECKSUM_KEY": "${PAYOS_CHECKSUM_KEY:-test_payos_checksum}"
  }
}
EOF

# Outbox processor env
cat > env.outbox-processor.json <<EOF
{
  "Variables": {
    "NODE_ENV": "development",
    "LOG_LEVEL": "debug",
    "DATABASE_URL": "${DATABASE_URL:-postgresql://root:root@postgres-payment:5432/ticketbottle_payment}",
    "KAFKA_BROKERS": "${KAFKA_BROKERS:-kafka:29092}",
    "KAFKA_SSL": "${KAFKA_SSL:-false}",
    "OUTBOX_BATCH_SIZE": "50",
    "OUTBOX_MAX_RETRIES": "3"
  }
}
EOF

# Outbox cleanup env
cat > env.outbox-cleanup.json <<EOF
{
  "Variables": {
    "NODE_ENV": "development",
    "LOG_LEVEL": "debug",
    "DATABASE_URL": "${DATABASE_URL:-postgresql://root:root@postgres-payment:5432/ticketbottle_payment}",
    "OUTBOX_RETENTION_DAYS": "7"
  }
}
EOF

echo -e "${GREEN}Environment files created${NC}"

# Create Lambda functions
echo -e "${YELLOW}Creating Lambda functions${NC}"

# Payment webhook handler
awslocal lambda create-function \
  --function-name payment-webhook-handler \
  --runtime nodejs20.x \
  --role $LAMBDA_ROLE_ARN \
  --handler index.handler \
  --timeout 30 \
  --memory-size 512 \
  --zip-file fileb://build/payment-webhook-handler.zip \
  --layers $DEPENDENCIES_LAYER_ARN $COMMON_LAYER_ARN \
  --environment file://env.localstack.json >/dev/null 2>&1

echo -e "${GREEN}payment-webhook-handler created${NC}"

# Outbox processor
awslocal lambda create-function \
  --function-name outbox-processor \
  --runtime nodejs20.x \
  --role $LAMBDA_ROLE_ARN \
  --handler index.handler \
  --timeout 300 \
  --memory-size 512 \
  --zip-file fileb://build/outbox-processor.zip \
  --layers $DEPENDENCIES_LAYER_ARN $COMMON_LAYER_ARN \
  --environment file://env.outbox-processor.json >/dev/null 2>&1

echo -e "${GREEN}outbox-processor created${NC}"

# Outbox cleanup
awslocal lambda create-function \
  --function-name outbox-cleanup \
  --runtime nodejs20.x \
  --role $LAMBDA_ROLE_ARN \
  --handler index.handler \
  --timeout 300 \
  --memory-size 256 \
  --zip-file fileb://build/outbox-cleanup.zip \
  --layers $DEPENDENCIES_LAYER_ARN $COMMON_LAYER_ARN \
  --environment file://env.outbox-cleanup.json >/dev/null 2>&1

echo -e "${GREEN}outbox-cleanup created${NC}"

# Setup API Gateway
echo -e "${YELLOW}Setting up API Gateway${NC}"

API_ID=$(awslocal apigateway create-rest-api \
  --name ticketbottle-webhooks \
  --description "Payment webhook endpoints" \
  --query 'id' \
  --output text)

ROOT_RESOURCE_ID=$(awslocal apigateway get-resources \
  --rest-api-id $API_ID \
  --query 'items[0].id' \
  --output text)

WEBHOOK_RESOURCE_ID=$(awslocal apigateway create-resource \
  --rest-api-id $API_ID \
  --parent-id $ROOT_RESOURCE_ID \
  --path-part webhook \
  --query 'id' \
  --output text)

ZALOPAY_RESOURCE_ID=$(awslocal apigateway create-resource \
  --rest-api-id $API_ID \
  --parent-id $WEBHOOK_RESOURCE_ID \
  --path-part zalopay \
  --query 'id' \
  --output text)

PAYOS_RESOURCE_ID=$(awslocal apigateway create-resource \
  --rest-api-id $API_ID \
  --parent-id $WEBHOOK_RESOURCE_ID \
  --path-part payos \
  --query 'id' \
  --output text)

# Create POST methods
awslocal apigateway put-method \
  --rest-api-id $API_ID \
  --resource-id $ZALOPAY_RESOURCE_ID \
  --http-method POST \
  --authorization-type NONE >/dev/null

awslocal apigateway put-integration \
  --rest-api-id $API_ID \
  --resource-id $ZALOPAY_RESOURCE_ID \
  --http-method POST \
  --type AWS_PROXY \
  --integration-http-method POST \
  --uri "arn:aws:apigateway:us-east-1:lambda:path/2015-03-31/functions/arn:aws:lambda:us-east-1:000000000000:function:payment-webhook-handler/invocations" >/dev/null

awslocal apigateway put-method \
  --rest-api-id $API_ID \
  --resource-id $PAYOS_RESOURCE_ID \
  --http-method POST \
  --authorization-type NONE >/dev/null

awslocal apigateway put-integration \
  --rest-api-id $API_ID \
  --resource-id $PAYOS_RESOURCE_ID \
  --http-method POST \
  --type AWS_PROXY \
  --integration-http-method POST \
  --uri "arn:aws:apigateway:us-east-1:lambda:path/2015-03-31/functions/arn:aws:lambda:us-east-1:000000000000:function:payment-webhook-handler/invocations" >/dev/null

# Deploy API
awslocal apigateway create-deployment \
  --rest-api-id $API_ID \
  --stage-name dev >/dev/null

API_ENDPOINT="http://localhost:4566/restapis/$API_ID/dev/_user_request_"

echo -e "${GREEN}API Gateway created${NC}"

# Setup EventBridge schedules
echo -e "${YELLOW}Setting up EventBridge${NC}"

awslocal events put-rule \
  --name outbox-processor-schedule \
  --schedule-expression "rate(1 minute)" \
  --state ENABLED >/dev/null

awslocal events put-targets \
  --rule outbox-processor-schedule \
  --targets "Id"="1","Arn"="arn:aws:lambda:us-east-1:000000000000:function:outbox-processor" >/dev/null

awslocal events put-rule \
  --name outbox-cleanup-schedule \
  --schedule-expression "cron(0 2 * * ? *)" \
  --state ENABLED >/dev/null

awslocal events put-targets \
  --rule outbox-cleanup-schedule \
  --targets "Id"="1","Arn"="arn:aws:lambda:us-east-1:000000000000:function:outbox-cleanup" >/dev/null

echo -e "${GREEN}EventBridge schedules created${NC}"

# Check if database is running and apply migrations
echo -e "${YELLOW}Checking database${NC}"
cd ..

# Try to find postgres container for payment service
POSTGRES_CONTAINER=$(docker ps --filter "name=postgres-payment" --format "{{.Names}}" | head -1)

if [ -n "$POSTGRES_CONTAINER" ]; then
  echo -e "${YELLOW}Database: ${POSTGRES_CONTAINER}${NC}"
  echo -e "${YELLOW}Waiting for PostgreSQL${NC}"

  until docker exec "$POSTGRES_CONTAINER" pg_isready -U root >/dev/null 2>&1; do
    echo -e "${YELLOW}Waiting for PostgreSQL${NC}"
    sleep 2
  done

  echo -e "${YELLOW}Running migrations${NC}"
  DATABASE_URL="postgresql://root:root@localhost:5433/ticketbottle_payment" npx prisma migrate deploy >/dev/null 2>&1 || echo -e "${YELLOW}Migrations skipped${NC}"
  echo -e "${GREEN}Database ready${NC}"
else
  echo -e "${YELLOW}PostgreSQL container not found${NC}"
  echo -e "${YELLOW}Start: cd development && docker-compose -f docker-compose.dev.yml up -d${NC}"
fi

cd lambdas

# Create test events directory
mkdir -p test-events
if [ ! -f "test-events/empty.json" ]; then
  echo '{}' > test-events/empty.json
fi

echo -e "\n${GREEN}LocalStack setup complete${NC}\n"
echo -e "${BLUE}Quick Reference${NC}"
echo -e "${YELLOW}Webhook:${NC} $API_ENDPOINT/webhook/zalopay"
echo -e "${YELLOW}Functions:${NC}"
echo -e "  - payment-webhook-handler"
echo -e "  - outbox-processor"
echo -e "  - outbox-cleanup"
echo -e "\n${BLUE}Test Commands${NC}"
echo -e "${YELLOW}List:${NC}"
echo -e "  awslocal lambda list-functions\n"
echo -e "${YELLOW}Invoke:${NC}"
echo -e "  awslocal lambda invoke --function-name payment-webhook-handler --payload '{}' response.json\n"
echo -e "${YELLOW}Logs:${NC}"
echo -e "  awslocal logs tail /aws/lambda/payment-webhook-handler --follow\n"
echo -e "${YELLOW}HTTP Test:${NC}"
echo -e "  curl -X POST $API_ENDPOINT/webhook/zalopay -H 'Content-Type: application/json' -d '{}'\n"

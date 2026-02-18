#!/bin/bash
#
# update-image.sh - Rebuild and redeploy the admin app container image
#
# Usage: ./update-image.sh [--stack-name NAME] [--region REGION]
#
# This script builds the Docker image, pushes it to ECR, and forces
# a new ECS deployment to pick up the updated image.
#

set -e

REGION="ap-northeast-1"
STACK_NAME="gameday-admin-dev"
ECR_REPO_NAME="gameday-admin"
IMAGE_TAG="latest"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

while [[ $# -gt 0 ]]; do
    case $1 in
        --stack-name) STACK_NAME="$2"; shift 2 ;;
        --region)     REGION="$2"; shift 2 ;;
        --help)
            echo "Usage: $0 [--stack-name NAME] [--region REGION]"
            echo ""
            echo "Options:"
            echo "  --stack-name  CloudFormation stack name (default: gameday-admin-dev)"
            echo "  --region      AWS region (default: ap-northeast-1)"
            exit 0
            ;;
        *) echo "Unknown option: $1"; exit 1 ;;
    esac
done

AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
ECR_URI="${AWS_ACCOUNT_ID}.dkr.ecr.${REGION}.amazonaws.com"
IMAGE_URI="${ECR_URI}/${ECR_REPO_NAME}:${IMAGE_TAG}"

echo "=== Admin App Image Update ==="
echo "Stack:  ${STACK_NAME}"
echo "Image:  ${IMAGE_URI}"
echo ""

# Step 1: ECR login
echo "[1/4] ECR login..."
aws ecr get-login-password --region "$REGION" | docker login --username AWS --password-stdin "$ECR_URI"

# Step 2: Build
echo "[2/4] Building Docker image..."
docker build -t "${ECR_REPO_NAME}:${IMAGE_TAG}" "$SCRIPT_DIR"

# Step 3: Push
echo "[3/4] Pushing to ECR..."
docker tag "${ECR_REPO_NAME}:${IMAGE_TAG}" "$IMAGE_URI"
docker push "$IMAGE_URI"

# Step 4: Force new ECS deployment via CloudFormation update
echo "[4/4] Updating ECS service via CloudFormation..."
CURRENT_PARAMS=$(aws cloudformation describe-stacks \
    --stack-name "$STACK_NAME" \
    --region "$REGION" \
    --query 'Stacks[0].Parameters' \
    --output json)

# Extract current parameter values
get_param() {
    echo "$CURRENT_PARAMS" | python3 -c "
import sys, json
params = json.load(sys.stdin)
for p in params:
    if p['ParameterKey'] == '$1':
        print(p['ParameterValue'])
        break
"
}

aws cloudformation deploy \
    --template-file "${SCRIPT_DIR}/template.yaml" \
    --stack-name "$STACK_NAME" \
    --region "$REGION" \
    --parameter-overrides \
        Environment="$(get_param Environment)" \
        ContainerImage="$IMAGE_URI" \
        CreateDynamoDB="$(get_param CreateDynamoDB)" \
        ClusterName="$(get_param ClusterName)" \
        SplunkRealm="$(get_param SplunkRealm)" \
        "ParameterKey=AdminPassword,UsePreviousValue=true" \
        ImageVersion="$(date +%s)" \
    --capabilities CAPABILITY_NAMED_IAM \
    --tags \
        splunkit_data_classification=public \
        splunkit_environment_type=non-prd \
        Project=o11y-gameday

ENDPOINT=$(aws cloudformation describe-stacks \
    --stack-name "$STACK_NAME" \
    --region "$REGION" \
    --query "Stacks[0].Outputs[?OutputKey=='ServiceEndpoint'].OutputValue" \
    --output text 2>/dev/null || echo "pending")

echo ""
echo "=== Update Complete ==="
echo "Endpoint: ${ENDPOINT}"
echo "Admin:    ${ENDPOINT}/admin"

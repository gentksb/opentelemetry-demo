#!/usr/bin/env bash
# DynamoDB Localにゲームデイ用テーブルを作成するスクリプト
# 前提: docker-compose.dev.yml で dynamodb-local が起動済み

set -e

ENDPOINT="${DYNAMODB_ENDPOINT:-http://localhost:8000}"
REGION="${AWS_REGION:-ap-northeast-1}"

AWS_ARGS="--endpoint-url $ENDPOINT --region $REGION --no-cli-pager"
DUMMY_CREDS="AWS_ACCESS_KEY_ID=dummy AWS_SECRET_ACCESS_KEY=dummy"

create_table() {
  local name="$1"
  shift
  if env $DUMMY_CREDS aws dynamodb describe-table --table-name "$name" $AWS_ARGS >/dev/null 2>&1; then
    echo "  skip: $name (already exists)"
  else
    env $DUMMY_CREDS aws dynamodb create-table --table-name "$name" $AWS_ARGS "$@" --billing-mode PAY_PER_REQUEST >/dev/null
    echo "  created: $name"
  fi
}

echo "DynamoDB Local にテーブルを作成します ($ENDPOINT)"

create_table "gameday-teams" \
  --attribute-definitions AttributeName=team_id,AttributeType=S \
  --key-schema AttributeName=team_id,KeyType=HASH

create_table "gameday-answers" \
  --attribute-definitions AttributeName=team_id,AttributeType=S AttributeName=question_id,AttributeType=S \
  --key-schema AttributeName=team_id,KeyType=HASH AttributeName=question_id,KeyType=RANGE

create_table "gameday-questions" \
  --attribute-definitions AttributeName=question_id,AttributeType=S \
  --key-schema AttributeName=question_id,KeyType=HASH

create_table "gameday-settings" \
  --attribute-definitions AttributeName=setting_key,AttributeType=S \
  --key-schema AttributeName=setting_key,KeyType=HASH

echo "完了"

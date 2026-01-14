# Telegram Bot Alerts (AWS Lambda + DynamoDB Streams)

This folder contains the Lambda code and setup steps to send Telegram alerts when a new `person_count` record is written to DynamoDB.

## Files
- `lambda_function.py`: Lambda handler code to post Telegram messages.
- `README.md`: Setup instructions (this file).

## Prerequisites
- DynamoDB table `metrics` already receiving items from your project.
- AWS account in the same region as your DynamoDB table (e.g., `eu-north-1`).
- Telegram app installed on your phone.

## 1) Create a Telegram bot
1. Open Telegram and chat with **@BotFather**.
2. Send `/newbot` and follow the prompts.
3. Save the **BOT_TOKEN** it gives you.

## 2) Get your Chat ID
1. Open a chat with your new bot (search by its username).
2. Send a message like `hi`.
3. In a browser, open:
   ```
   https://api.telegram.org/bot<YOUR_BOT_TOKEN>/getUpdates
   ```
4. Find your `chat.id` in the response. That is your **CHAT_ID**.

## 3) Enable DynamoDB Streams
1. AWS Console → DynamoDB → Tables → `metrics`.
2. **Exports and streams** → **DynamoDB Streams** → Enable.
3. Set **Stream view type** to **NEW_IMAGE**.

If you already enabled Streams before, you may need to disable and re-enable to refresh the stream ARN.

## 4) Create the Lambda function
1. AWS Console → Lambda → **Create function**.
2. **Author from scratch**.
3. Name: `peoplecount-telegram-alert`.
4. Runtime: **Python 3.11**.
5. Create.

## 5) Paste the Lambda code
1. Open the function → **Code** tab.
2. Replace the file contents with `telegram_bot/lambda_function.py`.
3. **Deploy**.

## 6) Set environment variables
Lambda → **Configuration → Environment variables**:
- `BOT_TOKEN` = your bot token
- `CHAT_ID` = your chat id
- `PEOPLE_THRESHOLD` = `1`

## 7) Set the Lambda handler
Lambda → **Code** tab → **Runtime settings** → **Edit**:
```
lambda_function.lambda_handler
```

## 8) Add DynamoDB trigger
1. Lambda → **Add trigger** → **DynamoDB**.
2. Table: `metrics`.
3. Batch size: `1`.
4. Starting position: **LATEST**.
5. Enable trigger.

If you get a permissions error, attach the policy **AWSLambdaDynamoDBExecutionRole** to the Lambda execution role.

## 9) Test
Trigger a person count update (count >= 1). You should receive a Telegram message.

## Troubleshooting
- Check Lambda logs: **Monitor → View CloudWatch logs**.
- Ensure Stream view type is **NEW_IMAGE**.
- Ensure the trigger is **Enabled**.
- Make sure the bot received at least one message from you.

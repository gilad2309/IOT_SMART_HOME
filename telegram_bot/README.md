# Telegram Bot Alerts + Commands (AWS Lambda + DynamoDB Streams + AWS IoT)

This folder contains Lambda code and setup steps for two Telegram features:
- Alerts when a new `person_count` record is written to DynamoDB.
- Command control that publishes actions to AWS IoT Core for the Jetson.

## Files
- `lambda_function.py`: DynamoDB Streams handler that posts Telegram alerts.
- `command_lambda_function.py`: Telegram webhook handler that publishes commands to AWS IoT Core.
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

---

# Telegram Command Lambda (AWS IoT Core)

This Lambda receives Telegram messages via webhook and publishes an MQTT message to the AWS IoT Core broker (your account’s IoT endpoint). The Jetson connects to the same AWS IoT Core MQTT broker, subscribes to the command topic, and performs actions when it receives those messages.


## Commands
- `run` → starts `npm run serve -- --no-ddb`
- `run -db` → starts `npm run serve -- --ddb`
- `start pipeline` → same as UI Start Pipeline
- `stop` → stops the running server process

## 1) Create the Lambda function
1. AWS Console → Lambda → **Create function**.
2. **Author from scratch**.
3. Name: `telegram-command-handler`.
4. Runtime: **Python 3.11**.

## 2) Paste the Lambda code
1. Open the function → **Code** tab.
2. Replace the file contents with `telegram_bot/command_lambda_function.py`.
3. **Deploy**.

## 3) Set environment variables
Lambda → **Configuration → Environment variables**:
- `ALLOWED_CHAT_ID` = your chat id (string)
- `IOT_ENDPOINT` = your AWS IoT Core endpoint (e.g., `xxxxxxxx-ats.iot.eu-north-1.amazonaws.com`)
- `COMMAND_TOPIC` = `devices/Jetson/commands` (or your custom topic)

## 4) Add IAM permissions
Attach a policy to the Lambda role:
```json
{
  "Effect": "Allow",
  "Action": ["iot:Publish"],
  "Resource": "arn:aws:iot:eu-north-1:YOUR_ACCOUNT_ID:topic/devices/Jetson/commands"
}
```

## 5) Create a Function URL
1. Lambda → **Configuration → Function URL** → **Create**.
2. Auth type: **NONE**.
3. Save the Function URL.

## 6) Set the Telegram webhook
Open in a browser:
```
https://api.telegram.org/bot<YOUR_BOT_TOKEN>/setWebhook?url=<YOUR_FUNCTION_URL>
```

## 7) Test
Send `run` or `start pipeline` to your bot. The Jetson should respond via MQTT.

## Troubleshooting
- Check Lambda logs: **Monitor → View CloudWatch logs**.
- Ensure Stream view type is **NEW_IMAGE**.
- Ensure the trigger is **Enabled**.
- Make sure the bot received at least one message from you.

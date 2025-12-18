import boto3
import os
import json
from discord_webhook import DiscordWebhook
from mcstatus import JavaServer
from switch import get_server_ip

ECS_CLUSTER = os.environ['CLUSTER_NAME']
SERVICE_NAME = os.environ['SERVICE_NAME']
DISCORD_WEBHOOK_URL = os.environ['DISCORD_WEBHOOK_URL']

def handler(event, context):

    print("Received Event:", json.dumps(event))

    source = event.get('source')
    detail_type = event.get('detail-type')

    # running trigger
    if source == 'aws.ecs':
        webhook_msg("Server started")
        return {"status": "started_notification_sent"}
    
    # scheduled trigger
    elif source == 'aws.events' and detail_type == 'Scheduled Event':
        check_and_shutdown()
        return {"status": "check_complete"}
    
    else:
        return {"status": "unknown_source"}

def check_and_shutdown():
    
    ip = get_server_ip()
    if not ip:  # server not up
        return
    
    server = JavaServer.lookup(ip)
    status = server.status()
    if status.players.online > 0:  # someone's online
        return
    if status.players.online == 0: # server empty
        ecs.update_service(cluster=ECS_CLUSTER, service=SERVICE_NAME, desiredCount=0)
        webhook_msg("Server is empty for a while, shutting down...")
        return


def webhook_msg(msg: str):
    # TODO: customize webhook
    if DISCORD_WEBHOOK_URL=='':
        return
    webhook = DiscordWebhook(url=DISCORD_WEBHOOK_URL, content=msg)
    webhook.execute()
    return
import boto3
import os
import json
from discord_webhook import DiscordWebhook
from mcstatus import JavaServer
import datetime
from dateutil.tz import tzutc

from switch import get_server_ip

# initialize AWS clients
ecs = boto3.client('ecs')

# get environment variables
CLUSTER = os.environ['CLUSTER_NAME']
SERVICE = os.environ['SERVICE_NAME']
DISCORD_WEBHOOK_URL = os.environ['DISCORD_WEBHOOK_URL']

def handler(event, context):

    print("Received Event:", json.dumps(event))

    source = event.get('source')
    detail_type = event.get('detail-type')

    # running trigger
    if source == 'aws.ecs':
        try:
            ip = get_server_ip()
            if str(ip):
                webhook_msg(f"Server starting: {str(ip)}")
            print(f"Server starting: {ip}")
            return {"status": "started_notification_sent"}
        except Exception as e:
            print(f"Error: {str(e)}")
            return {"status": "error_getting_ip", "error": str(e)}
    
    # scheduled trigger
    elif source == 'aws.events' and detail_type == 'Scheduled Event':
        print("Scheduled event")
        check_and_shutdown()
        return {"status": "check_complete"}
    
    else:
        print("Unknown source")
        return {"status": "unknown_source"}

def check_and_shutdown():
    
    ip = get_server_ip()
    if not ip:  # server not up
        print("Server not up")
        return
    
    server = JavaServer.lookup(ip)
    status = server.status()
    if status.players.online > 0:  # someone's online
        print("Server is not empty")
        return
    if status.players.online == 0: # server empty

        # check task uptime
        task_arn = ecs.list_tasks(cluster=CLUSTER, serviceName=SERVICE, desiredStatus='RUNNING')['taskArns'][0]
        uptime = get_task_uptime(task_arn)
        if uptime < 900:  # 15 min
            print("Task is too new, not shutting down")
            return

        ecs.update_service(cluster=CLUSTER, service=SERVICE, desiredCount=0)
        print("Server is empty, shutting down...")
        webhook_msg("Server is empty for a while, shutting down...")
        return

def get_task_uptime(task_arn):
    # prevent task from being killed too early
    resp = ecs.describe_tasks(cluster=CLUSTER, tasks=[task_arn])
    tasks = resp.get('tasks', [])
    
    if not tasks:
        return 0
        
    task = tasks[0]
    start_time = task.get('startedAt') or task.get('createdAt')
    
    if not start_time:
        return 0

    now = datetime.datetime.now(tzutc())
    diff = now - start_time
    
    return diff.total_seconds()


def webhook_msg(msg: str):
    # TODO: customize webhook
    if DISCORD_WEBHOOK_URL=='':
        return
    webhook = DiscordWebhook(url=DISCORD_WEBHOOK_URL, content=msg)
    webhook.execute()
    return
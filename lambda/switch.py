import boto3
import os
import json

# initialize AWS clients
ecs = boto3.client('ecs')
ec2 = boto3.client('ec2')

# get environment variables
CLUSTER = os.environ['CLUSTER_NAME']
SERVICE = os.environ['SERVICE_NAME']



def get_server_ip():

    try:
        
        # get running tasks
        taskArns = ecs.list_tasks(cluster=CLUSTER, serviceName=SERVICE, desiredStatus='RUNNING').get('taskArns')
        if not taskArns:
            return None

        # task -> container instance
        containerInstanceArn = ecs.describe_tasks(cluster=CLUSTER, tasks=taskArns)['tasks'][0].get('containerInstanceArn')
        if not containerInstanceArn:
            return None

        # container instance -> ec2 instance
        ec2InstanceId = ecs.describe_container_instances(cluster=CLUSTER, 
                            containerInstances=[containerInstanceArn])['containerInstances'][0].get('ec2InstanceId')
        if not ec2InstanceId:
            return None

        # ec2 instance -> public ip
        publicIp = ec2.describe_instances(InstanceIds=[ec2InstanceId])['Reservations'][0]['Instances'][0].get('PublicIpAddress')
        if not publicIp:
            return None
        
        return publicIp

    except Exception as e:
        print(f"Error: {str(e)}")
        return None

def handler(event, context):
    print("Received event:", event) # Debug 用

    try:
        # API POST
        body = {}
        if 'body' in event and event['body']:
            body = json.loads(event['body'])
        
        # get action
        action = body.get('action', 'status')

        # get current state
        service_desc = ecs.describe_services(cluster=CLUSTER, services=[SERVICE])
        current_count = service_desc['services'][0]['desiredCount']
        
        response_data = {}

        # start
        if action == 'start':
            if current_count == 0:
                ecs.update_service(cluster=CLUSTER, service=SERVICE, desiredCount=1)
                response_data = {
                    "success": True,
                    "message": "Server starting sequence initiated.",
                    "state": "STARTING"
                }
            else:
                ip = get_server_ip()
                response_data = {
                    "success": False,
                    "message": ip,
                    "state": "RUNNING"
                }

        # stop
        elif action == 'stop':
            if current_count > 0:
                ecs.update_service(cluster=CLUSTER, service=SERVICE, desiredCount=0)
                response_data = {
                    "success": True,
                    "message": "Server stopping sequence initiated.",
                    "state": "STOPPING"
                }
            else:
                response_data = {
                    "success": False,
                    "message": "Server is already stopped.",
                    "state": "STOPPED"
                }
        
        else:
            response_data = {
                "success": False,
                "message": "Invalid action.",
                "state": "INVALID"
            }

        # return response
        return {
            'statusCode': 200,
            'headers': {'Content-Type': 'application/json'},
            'body': json.dumps(response_data)
        }

    except Exception as e:
        print(f"Error: {e}")
        return {
            'statusCode': 500,
            'body': json.dumps({"error": str(e)})
        }
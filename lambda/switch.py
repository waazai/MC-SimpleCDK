# lambda written in Python cause I can't write js

import os

def handler(event, context):

    # get cluster name from environment variable
    asg_name = os.environ.get('ASG_NAME')
    cluster = os.environ.get('CLUSTER_NAME')
    service_name = os.environ.get('SERVICE_NAME')
import * as cdk from 'aws-cdk-lib/core';
import { Construct } from 'constructs';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as efs from 'aws-cdk-lib/aws-efs';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import { AutoScalingGroup } from 'aws-cdk-lib/aws-autoscaling';
import * as fs from 'fs';
import * as dotenv from 'dotenv';


/**
 * Creates a simple Minecraft server.
 * Uses ECS to run the server and EFS to store the data.
 * ASG to keep track of the spot instances.
 */


/**
 * Get environment variables
 * Default to small instance to avoid cost
 * Default to 1.5GB memory and 1 vCPU to avoid cost
 * Do not need default MC config cause itzg/minecraft-server has its own default
 */
const envConfig = dotenv.parse(fs.readFileSync('.env', 'utf-8'));
const mcConfig = dotenv.parse(fs.readFileSync('.env', 'utf-8'));
const instanceType = envConfig.INSTANCE_TYPE ?? 't3.small';
const memoryLimit = Number(`${envConfig.MEMORY_LIMIT}`) ?? 1536;
const cpuLimit = Number(`${envConfig.CPU_LIMIT}`) ?? 1024;




export class McSimpleStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);
    

    /**
     * VPC: where all resources will be created
     */
    const vpc = new ec2.Vpc(this, 'TheVpc', {
      ipAddresses: ec2.IpAddresses.cidr('10.100.0.0/16'),
      maxAzs: 2,
      subnetConfiguration: [
        {
          cidrMask: 24,
          name: 'PublicSubnet',
          subnetType: ec2.SubnetType.PUBLIC,
          // did not enable NAT Gateways for cost savings
        }]
    });

    /**
     * EFS: storage
     */
    const fileSystem = new efs.FileSystem(this, 'TheEfs', {
      vpc,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      lifecyclePolicy: efs.LifecyclePolicy.AFTER_14_DAYS,
      performanceMode: efs.PerformanceMode.GENERAL_PURPOSE,
    });


    /**
     * ECS Cluster: where the container will run on
     */
    const cluster = new ecs.Cluster(this, 'Cluster', {
      vpc,
      clusterName: `${this.stackName}-cluster`,
      containerInsightsV2: ecs.ContainerInsights.ENHANCED
    });


    /**
     * User Data: execute on instance start
     */
    const userData = ec2.UserData.forLinux();
    userData.addCommands(
      `echo ECS_CLUSTER=${cluster.clusterName} >> /etc/ecs/ecs.config`,  // link to the cluster
      // mount EFS
      `mkdir -p /mnt/efs`,
      `mount -t efs ${fileSystem.fileSystemId}:/ /mnt/efs`,
      `echo "${fileSystem.fileSystemId}:/ /mnt/efs efs defaults,_netdev 0 0" >> /etc/fstab`
    );


    /**
     * ASG: manage EC2 instances
     */
    const asg = new AutoScalingGroup(this, 'TheAsg', {
      vpc,
      instanceType: new ec2.InstanceType(instanceType),
      machineImage: ecs.EcsOptimizedImage.amazonLinux2(),
      userData: userData,
      minCapacity: 0,  // do not need instance when server off
      maxCapacity: 1,  // only need up to 1 for server running
    });
    const capacityProvider = new ecs.AsgCapacityProvider(this, 'AsgCapacityProvider', {
      // prevent instance from being terminated
      autoScalingGroup: asg,
      enableManagedScaling: true,
      enableManagedTerminationProtection: true
    });
    cluster.addAsgCapacityProvider(capacityProvider);
    asg.role.addManagedPolicy(
      iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonElasticFileSystemClientFullAccess')
    );


    /**
     * Security Groups: access control
     */
    const sg = new ec2.SecurityGroup(this, 'TheSecurityGroup', {
      vpc,
      allowAllOutbound: true,
      securityGroupName: 'MCSimpleSG',
    });
    asg.connections.addSecurityGroup(sg);
    fileSystem.connections.allowDefaultPortFrom(sg, 'Allow ECS access to EFS');
    asg.connections.allowFromAnyIpv4(ec2.Port.tcp(25565), 'Allow MC TCP Port');


    /**
     * Task Definition: container settings
     */
    const taskDef = new ecs.Ec2TaskDefinition(this, 'TheTaskDef', {
      networkMode: ecs.NetworkMode.BRIDGE,  // use network from ec2
    });
    const container = taskDef.addContainer('TheContainer', {
      image: ecs.ContainerImage.fromRegistry('itzg/minecraft-server'),
      memoryLimitMiB: memoryLimit,
      cpu:cpuLimit,
      logging: ecs.LogDrivers.awsLogs({ streamPrefix: 'MC-Simple' }),
      environment: {
        ...mcConfig,
        EULA: 'TRUE'
      },
    });
    container.addPortMappings({  // Minecraft default port
      containerPort: 25565,
      hostPort: 25565,
      protocol: ecs.Protocol.TCP,
    });
    taskDef.addVolume({  // EFS Volume
      name: 'EfsVolume',
      host: {
        sourcePath: '/mnt/efs/mcdata',
      },
    });


    /**
     * Service: starts the container
     */
    const service = new ecs.Ec2Service(this, 'TheService', {
      cluster,
      taskDefinition: taskDef,
      desiredCount: 1,   // default server start
      minHealthyPercent: 0,  
      maxHealthyPercent: 100,  // shut down immediately if needed
      capacityProviderStrategies: [
        {
          capacityProvider: capacityProvider.capacityProviderName,
          weight: 1
        }
      ]
    });


    /**
     * Lambda
     */
    const serverSwitch = new lambda.Function(this, 'ServerSwitch', {
      // turn the server on and off
      runtime: lambda.Runtime.PYTHON_3_12,
      handler: 'switch.handler',
      code: lambda.Code.fromAsset('lambda'),
      environment: {
        CLUSTER_NAME: cluster.clusterName,
        SERVICE_NAME: service.serviceName,
      }
      // maybe set a timeout if needed
    });


    /**
     * API Gateway
     */
    const api = new apigateway.LambdaRestApi(this, 'ServerSwitchApi', {
      handler: serverSwitch,
      proxy: false
    });
    const switchResource = api.root.addResource('switch');
    switchResource.addMethod('POST', new apigateway.LambdaIntegration(serverSwitch));

    //IAM permissions
    serverSwitch.addToRolePolicy(new iam.PolicyStatement({
      actions: [
        'ecs:UpdateService',  // update service
        'ecs:DescribeServices',  // get current state

        // get ip
        'ecs:ListTasks',
        'ecs:DescribeTasks',
        'ecs:DescribeContainerInstances',
        'ec2:DescribeInstances'
      ],
      resources: ['*'], // allow all resources
    }));


    /**
     * Outputs
     */
    new cdk.CfnOutput(this, 'ServerSwitchApiUrl', {
      value: api.url,
      description: 'URL to control the server'
    });


  }
}

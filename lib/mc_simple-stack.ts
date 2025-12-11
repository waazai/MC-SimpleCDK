import * as cdk from 'aws-cdk-lib/core';
import { Construct } from 'constructs';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as efs from 'aws-cdk-lib/aws-efs';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as iam from 'aws-cdk-lib/aws-iam';
import { AutoScalingGroup } from 'aws-cdk-lib/aws-autoscaling';
import * as fs from 'fs';
import * as dotenv from 'dotenv';


/**
 * Creates a simple Minecraft server.
 * Uses ECS to run the server and EFS to store the data.
 * ASG to allow the server to be shutdown when not in use.
 */


export class McSimpleStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const envConfig = dotenv.parse(fs.readFileSync('.env', 'utf-8'));
    const mcConfig = dotenv.parse(fs.readFileSync('.env', 'utf-8'));

    /**
     * VPC
     */
    const vpc = new ec2.Vpc(this, 'TheVpc', {
      ipAddresses: ec2.IpAddresses.cidr('10.100.0.0/16'),
      maxAzs: 2,
      subnetConfiguration: [
        {
          cidrMask: 24,
          name: 'PublicSubnet',
          subnetType: ec2.SubnetType.PUBLIC,
        }]
    });

    /**
     * EFS
     */
    const fileSystem = new efs.FileSystem(this, 'TheEfs', {
      vpc,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      lifecyclePolicy: efs.LifecyclePolicy.AFTER_14_DAYS,
      performanceMode: efs.PerformanceMode.GENERAL_PURPOSE,
    });


    /**
     * ECS Cluster
     */
    const cluster = new ecs.Cluster(this, 'Cluster', {
      vpc,
      clusterName: `${this.stackName}-cluster`,
      containerInsightsV2: ecs.ContainerInsights.ENHANCED
    });


    /**
     * User Data
     */
    const userData = ec2.UserData.forLinux();
    userData.addCommands(
      `echo ECS_CLUSTER=${cluster.clusterName} >> /etc/ecs/ecs.config`,
      `mkdir -p /mnt/efs`,
      `mount -t efs ${fileSystem.fileSystemId}:/ /mnt/efs`,
      `echo "${fileSystem.fileSystemId}:/ /mnt/efs efs defaults,_netdev 0 0" >> /etc/fstab`
    );


    /**
     * Auto Scaling Group
     */
    const asg = new AutoScalingGroup(this, 'TheAsg', {
      vpc,
      instanceType: new ec2.InstanceType(`${envConfig.INSTANCE_TYPE}`),
      machineImage: ecs.EcsOptimizedImage.amazonLinux2(),
      userData: userData,
      minCapacity: 0,
      maxCapacity: 1,
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
     * Security Groups
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
     * Task Definition
     */
    const taskDef = new ecs.Ec2TaskDefinition(this, 'TheTaskDef', {
      networkMode: ecs.NetworkMode.BRIDGE,  // use network from ec2
    });
    const container = taskDef.addContainer('TheContainer', {
      image: ecs.ContainerImage.fromRegistry('itzg/minecraft-server'),
      memoryLimitMiB: Number(`${envConfig.MEMORY_LIMIT}`),
      cpu: Number(`${envConfig.CPU_LIMIT}`),
      logging: ecs.LogDrivers.awsLogs({ streamPrefix: 'MCSimple' }),
      environment: mcConfig,
    });
    container.addPortMappings({
      containerPort: 25565,
      hostPort: 25565,
      protocol: ecs.Protocol.TCP,
    });
    taskDef.addVolume({
      name: 'EfsVolume',
      host: {
        sourcePath: '/mnt/efs/mcdata',
      },
    });


    /**
     * Service
     */
    new ecs.Ec2Service(this, 'TheService', {
      cluster,
      taskDefinition: taskDef,
      desiredCount: 1,
      minHealthyPercent: 0,
      maxHealthyPercent: 100,
      capacityProviderStrategies: [
        {
          capacityProvider: capacityProvider.capacityProviderName,
          weight: 1
        }
      ]
    });

  }
}

import * as cdk from 'aws-cdk-lib/core';
import { Construct } from 'constructs';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as efs from 'aws-cdk-lib/aws-efs';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as yaml from 'js-yaml';
import * as fs from 'fs';
import { AutoScalingGroup } from 'aws-cdk-lib/aws-autoscaling';


const mcImgConfig = yaml.load(fs.readFileSync('docker/mcSimple.yaml', 'utf-8')) as any;

export class McSimpleStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);


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
      instanceType: new ec2.InstanceType('t3.medium'),
      machineImage: ecs.EcsOptimizedImage.amazonLinux2(),
      userData: userData,
      minCapacity: 0,
      maxCapacity: 1,
    });
    const capacityProvider = new ecs.AsgCapacityProvider(this, 'AsgCapacityProvider', {autoScalingGroup: asg});
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

    cluster.connections.addSecurityGroup(sg);
    fileSystem.connections.allowDefaultPortFrom(sg, 'Allow ECS access to EFS');
    cluster.connections.allowFromAnyIpv4(ec2.Port.tcp(25565), 'Allow MC TCP Port');


    /**
     * Task Definition
     */
    const taskDef = new ecs.Ec2TaskDefinition(this, 'TheTaskDef', {
      networkMode: ecs.NetworkMode.AWS_VPC,
    });
    const container = taskDef.addContainer('TheContainer', {
      image: ecs.ContainerImage.fromRegistry('itzg/minecraft-server'),
      memoryLimitMiB: 3072,
      cpu: 1024,
      logging: ecs.LogDrivers.awsLogs({ streamPrefix: 'MCSimple' }),
      environment: mcImgConfig.environment,
    });
    container.addPortMappings({
      containerPort: 25565,
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
      securityGroups: [sg],
      desiredCount: 1,
    });

  }
}

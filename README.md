# Welcome to your CDK TypeScript project

This is a blank project for CDK development with TypeScript.

The `cdk.json` file tells the CDK Toolkit how to execute your app.

## Requirments

* [AWS CLI/CDK](https://docs.aws.amazon.com/cdk/v2/guide/getting-started.html)
* [Node.js](https://nodejs.org/en/download/)

## Getting Started
1. Set up AWS credentials
`aws configure`
2. Install dependencies
`npm intall`
3. Bootstrap the CDK
`cdk bootstrap`
4. Deploy the stack
`cdk deploy`

## TODO

- Customize container image through env (or any config file), sticking with itzg/minecraft-server now
- Often have issue on `cdk destroy` failed, things don't get cleaned up
- Route 53 integration for DNS record (not needed so not doing this)
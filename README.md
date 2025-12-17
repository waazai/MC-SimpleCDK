## Description

<span style="font-size: 20px;">オギャッ🤗と生まれ🐣マイクラサーバー‼️🎊🎉</span>

A simple Minecraft server deployed on AWS using CDK.


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

## TODO/Issues

- Server up/down webhook report <- will work on this shortly
- CloudWatch Logs: leaving the errors mysterious
- Customize container image through env (or any config file), sticking with itzg/minecraft-server now
- Often have issue on `cdk destroy` failed, things don't get cleaned up
- Route 53 integration for DNS record (not needed so not doing this)
- Sever start and shutdown takes a while

## Reference
* [vatertime/minecraft-spot-pricing](https://github.com/vatertime/minecraft-spot-pricing)
* [AWS Documents](https://docs.aws.amazon.com/cdk/v2/guide/getting-started.html)
* [Gemini sensei](https://gemini.google.com)
* [平成ギャルズ!!!!- Ruri&To](https://music.youtube.com/watch?v=4d-Chyd4Ij4)

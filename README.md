## Description

<span style="font-size: 20px;">オギャッ🤗と生まれた🐣マイクラサーバー‼️🎊🎉</span>

A simple Minecraft server deployed on AWS using CDK.


## Requirments

* [AWS CLI/CDK](https://docs.aws.amazon.com/cdk/v2/guide/getting-started.html)
* [Node.js](https://nodejs.org/en/download/)

## Getting Started
1. Set up AWS credentials
`aws configure`
2. Install dependencies
`npm intall`
3. customize .env file
4. Bootstrap the CDK
`cdk bootstrap`
5. Deploy the stack
`cdk deploy`

## TODO/Issues

- Customize webhook <- will work on this shortly
- Shuts down the server whenever a scheduled check is triggered, maybe add a flag for timing

- CloudWatch Logs (leaving the errors mysterious)
- Customize container image through env (or any config file), sticking with itzg/minecraft-server now
- Often have issue on `cdk destroy` failed, things don't get cleaned up
- Route 53 integration for DNS record (not needed so not doing this)
- Sever start and shutdown takes a while

## Reference
* [vatertime/minecraft-spot-pricing](https://github.com/vatertime/minecraft-spot-pricing)
* [AWS Documents](https://docs.aws.amazon.com/cdk/v2/guide/getting-started.html)
* [Gemini sensei](https://gemini.google.com)
* [「平成ギャルズ!!!!」 / Ruri&To (ラブライブ！蓮ノ空女学院スクールアイドルクラブ 5th Live Tour ～4Pair Power Spread!!!!～)](https://www.youtube.com/watch?v=KczSwEZvJnE)

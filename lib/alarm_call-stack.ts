import {
  aws_events,
  aws_events_targets,
  Stack,
  StackProps,
} from 'aws-cdk-lib';
import { StateMachine } from 'aws-cdk-lib/aws-stepfunctions';
import { Construct } from 'constructs';

export class AlarmCallStack extends Stack {
  constructor(scope: Construct, id: string, stateMachine:StateMachine, props?: StackProps) {
    super(scope, id, props);

    // from context in paramater
    const name = this.node.tryGetContext('name');
    const alarmArn = this.node.tryGetContext('alarmArn');
    const waitSecinds =  this.node.tryGetContext('waitSecinds');
    const maxRetries =  this.node.tryGetContext('maxRetries');
    const phoneNumber =  this.node.tryGetContext('phoneNumber');

    const tag = `AlarmCall-${name}`;
    
    // EventBridge Rule
    new aws_events.Rule(this, `${id}_AlarmRule`, {
      ruleName: `${tag}`,
      eventPattern: {
        source: ['aws.cloudwatch'],
        detailType: ['CloudWatch Alarm State Change'],
        resources: [alarmArn],
      },
      targets: [
        new aws_events_targets.SfnStateMachine(stateMachine, {
          input: aws_events.RuleTargetInput.fromObject({
            'id': aws_events.EventField.fromPath('$.id'),
            'state': aws_events.EventField.fromPath('$.detail.state.value'),
            'waitSecinds': waitSecinds,
            'maxRetries': maxRetries,
            'phoneNumber': phoneNumber
          })
        })
      ]
    });
  }
}
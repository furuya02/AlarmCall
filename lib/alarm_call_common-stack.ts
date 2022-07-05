import {
  aws_stepfunctions,
  aws_lambda,
  aws_iam,
  Stack,
  StackProps,
  RemovalPolicy,
} from 'aws-cdk-lib';
import { StateMachine } from 'aws-cdk-lib/aws-stepfunctions';
import { Table, AttributeType, BillingMode } from 'aws-cdk-lib/aws-dynamodb';
import { Construct } from 'constructs';
  
export class AlarmCallCommonStack extends Stack {
  public readonly stateMachine: StateMachine;

  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);
    
    // from context in cdk.json
    const contactFlowId =  this.node.tryGetContext('contactFlowId');
    const instanceId =  this.node.tryGetContext('instanceId');
    const queueId =  this.node.tryGetContext('queueId');
    
    const tag = 'AlarmCall';

    // DynamoDB (Amazon Connectのフローの中で使用され、キー入力があった場合にidを保存するTable)
    const tableName = `${tag}_Table`;
    const table = new Table(this, 'Table', {
      tableName: tableName,
      partitionKey: {
        name: 'id',
        type: AttributeType.STRING,
      },
      timeToLiveAttribute: 'ttl',
      billingMode: BillingMode.PAY_PER_REQUEST,
      removalPolicy: RemovalPolicy.DESTROY
    });

    // Lambda　(Amazon Connectのフローの中で使用され、キー入力があった場合にidを保存するLambda)
    const saveIdFunctionRole = new aws_iam.Role(this, 'SaveIdFunctionRole', {
      assumedBy: new aws_iam.ServicePrincipal('lambda.amazonaws.com'),
      managedPolicies:[
        aws_iam.ManagedPolicy.fromAwsManagedPolicyName(
          'service-role/AWSLambdaBasicExecutionRole',
        )  
      ],
    });
    saveIdFunctionRole.addToPolicy(new aws_iam.PolicyStatement({
      effect: aws_iam.Effect.ALLOW,
      resources: [table.tableArn],
      actions: [
        'dynamodb:PutItem',
      ]
    }));

    new aws_lambda.Function(this, 'saveIdFunction', {
      code: aws_lambda.Code.fromAsset(`lambda/SaveId`),
      handler: 'lambda_function.lambda_handler',
      functionName: `${tag}_SaveId`,
      runtime: aws_lambda.Runtime.PYTHON_3_9,
      role: saveIdFunctionRole
    });

    // Lambda　(StepFunctionsの中で使用され、カウンターをインクリメントして、ループを継続するかどうかを返すLambda)
    const iteratorFunctionRole = new aws_iam.Role(this, 'IteratorFunctionRole', {
      assumedBy: new aws_iam.ServicePrincipal('lambda.amazonaws.com'),
      managedPolicies:[
        aws_iam.ManagedPolicy.fromAwsManagedPolicyName(
          'service-role/AWSLambdaBasicExecutionRole',
        )  
      ],
    });

    new aws_lambda.Function(this, 'IteratorFunction', {
      code: aws_lambda.Code.fromAsset(`lambda/Iterator`),
      handler: 'lambda_function.lambda_handler',
      functionName: `${tag}_Iterator`,
      runtime: aws_lambda.Runtime.PYTHON_3_9,
      role: iteratorFunctionRole
    });

    // Step Functions
    const finish = new aws_stepfunctions.Pass(this, 'Finish');

    const startOutboundVoiceContact = new aws_stepfunctions.CustomState(this, 'StartOutboundVoiceContact', {
      stateJson: {
        Type: 'Task',  
        Resource: 'arn:aws:states:::aws-sdk:connect:startOutboundVoiceContact',
        Parameters: {
          'ContactFlowId': contactFlowId,
          'DestinationPhoneNumber.$': '$.phoneNumber',
          'InstanceId': instanceId,
          'QueueId': queueId,
          'Attributes': {
            'id.$': '$.id'
          }
        },
        ResultPath: '$.call',
      }
    });

    const getIdFromDynamoDB = new aws_stepfunctions.CustomState(this, 'GetIdFromDynamoDB', {
      stateJson: {
        Type: 'Task',
        Resource: 'arn:aws:states:::dynamodb:getItem',
        Parameters: {
          TableName: tableName,
          Key: {
            id: {
              'S.$': '$.id',
            },
          },
        },
        ResultPath: '$.DynamoDB',
      }
    });

    const waitOutboundCall = new  aws_stepfunctions.Wait(this, 'WaitOutboundCall', {
      time: aws_stepfunctions.WaitTime.secondsPath('$.waitSecinds'),
    });
    
    const choiceLoopOrStop = new aws_stepfunctions.Choice(this, 'ChoiceLoopOrStop')
      .when(aws_stepfunctions.Condition.booleanEquals('$.iterator.isContinue', true), startOutboundVoiceContact)
      .otherwise(finish)

    const checkContinue = new aws_stepfunctions.CustomState(this, 'CheckContinue', {
      stateJson: {
        Type: 'Task',
        Resource: `arn:aws:lambda:ap-northeast-1:${this.account}:function:Iterator`,
        ResultPath: '$.iterator',
      }
    }).next(choiceLoopOrStop);

    const checkId = new aws_stepfunctions.Choice(this, 'CheckId')
      .when(aws_stepfunctions.Condition.isPresent('$.DynamoDB.Item.id.S'), finish)
      .otherwise(checkContinue)

    const counterInitialize = new aws_stepfunctions.Pass(this, 'CounterInitialize', {
      resultPath:'$.iterator',
      result: aws_stepfunctions.Result.fromObject({
        'counter': 0
      })
    })
      .next(startOutboundVoiceContact)
      .next(waitOutboundCall)
      .next(getIdFromDynamoDB)
      .next(checkId)
    
    const confirmationParams = new aws_stepfunctions.Choice(this, 'ConfirmationParams')
      .when(aws_stepfunctions.Condition.stringEquals('$.state', 'OK'), finish)
      .when(aws_stepfunctions.Condition.isNotPresent('$.id'), finish)
      .otherwise(counterInitialize)

    this.stateMachine = new aws_stepfunctions.StateMachine(this, 'StateMachine', {
        stateMachineName: `${tag}`,
        definition: confirmationParams
      }
    );
  }
}  
#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { AlarmCallStack } from '../lib/alarm_call-stack';
import { AlarmCallCommonStack } from '../lib/alarm_call_common-stack';

const app = new cdk.App();

// Common
const alarmCallCommonStack = new AlarmCallCommonStack(app, 'AlarmCallCommonStack', {});
const stackName = `AlarmCallStack-${app.node.tryGetContext('name')}`
new AlarmCallStack(app, stackName, alarmCallCommonStack.stateMachine, {});

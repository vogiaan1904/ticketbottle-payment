import { APIGatewayProxyEvent, Context, EventBridgeEvent } from 'aws-lambda';

/**
 * Create a mock API Gateway event for testing
 * @param overrides Partial event properties to override
 * @returns Mock API Gateway proxy event
 */
export const createMockAPIGatewayEvent = (
  overrides: Partial<APIGatewayProxyEvent> = {}
): APIGatewayProxyEvent => {
  return {
    body: null,
    headers: {},
    multiValueHeaders: {},
    httpMethod: 'POST',
    isBase64Encoded: false,
    path: '/webhook',
    pathParameters: null,
    queryStringParameters: null,
    multiValueQueryStringParameters: null,
    stageVariables: null,
    requestContext: {
      accountId: '123456789',
      apiId: 'test-api',
      authorizer: null,
      protocol: 'HTTP/1.1',
      httpMethod: 'POST',
      identity: {
        accessKey: null,
        accountId: null,
        apiKey: null,
        apiKeyId: null,
        caller: null,
        clientCert: null,
        cognitoAuthenticationProvider: null,
        cognitoAuthenticationType: null,
        cognitoIdentityId: null,
        cognitoIdentityPoolId: null,
        principalOrgId: null,
        sourceIp: '127.0.0.1',
        user: null,
        userAgent: 'test-agent',
        userArn: null,
      },
      path: '/webhook',
      stage: 'test',
      requestId: 'test-request-id',
      requestTimeEpoch: Date.now(),
      resourceId: 'test-resource',
      resourcePath: '/webhook',
    },
    resource: '/webhook',
    ...overrides,
  };
};

/**
 * Create a mock Lambda context for testing
 * @param overrides Partial context properties to override
 * @returns Mock Lambda context
 */
export const createMockContext = (overrides: Partial<Context> = {}): Context => {
  return {
    callbackWaitsForEmptyEventLoop: false,
    functionName: 'test-function',
    functionVersion: '1',
    invokedFunctionArn: 'arn:aws:lambda:us-east-1:123456789:function:test',
    memoryLimitInMB: '256',
    awsRequestId: 'test-request-id',
    logGroupName: '/aws/lambda/test',
    logStreamName: '2024/01/01/[$LATEST]test',
    getRemainingTimeInMillis: () => 30000,
    done: jest.fn(),
    fail: jest.fn(),
    succeed: jest.fn(),
    ...overrides,
  };
};

/**
 * Create a mock EventBridge event for testing
 * @param overrides Partial event properties to override
 * @returns Mock EventBridge event
 */
export const createMockEventBridgeEvent = <T = any>(
  overrides: Partial<EventBridgeEvent<string, T>> = {}
): EventBridgeEvent<string, T> => {
  return {
    version: '0',
    id: 'test-event-id',
    'detail-type': 'Scheduled Event',
    source: 'aws.events',
    account: '123456789',
    time: new Date().toISOString(),
    region: 'us-east-1',
    resources: [],
    detail: {} as T,
    ...overrides,
  };
};

/**
 * Mock Prisma client for testing
 */
export const createMockPrismaClient = () => {
  return {
    payment: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    outbox: {
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      delete: jest.fn(),
      deleteMany: jest.fn(),
    },
    $transaction: jest.fn((callback) => callback({
      payment: {
        update: jest.fn(),
      },
      outbox: {
        create: jest.fn(),
      },
    })),
    $connect: jest.fn(),
    $disconnect: jest.fn(),
  };
};

/**
 * Mock Kafka producer for testing
 */
export const createMockKafkaProducer = () => {
  return {
    connect: jest.fn().mockResolvedValue(undefined),
    disconnect: jest.fn().mockResolvedValue(undefined),
    send: jest.fn().mockResolvedValue([
      {
        topicName: 'test-topic',
        partition: 0,
        baseOffset: '0',
        errorCode: 0,
      },
    ]),
  };
};

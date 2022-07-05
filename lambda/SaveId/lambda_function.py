import boto3
from datetime import datetime
from datetime import timedelta

def lambda_handler(event, _context):

  print(event)

  try:
    id = event["Details"]["ContactData"]["Attributes"]["id"]

    table_name = 'AlarmCall_Table'
    ttl = datetime.now() + timedelta(days=1) # 1日後に削除
    item = {
      "id": id,
      "ttl":int(ttl.timestamp())
    }
    dynamo = boto3.resource('dynamodb')
    dynamo_table = dynamo.Table(table_name)
    dynamo_table.put_item(Item=item)
    print("Success: set id ({})".format(id))

  except Exception as e:
    print("Error: {}".format(e))

  return {}
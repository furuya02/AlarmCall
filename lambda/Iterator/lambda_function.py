def lambda_handler(event, _context):
  
  print(event)

  counter = event["iterator"]["counter"]
  max_retries = event["maxRetries"]
  counter += 1
  
  return  {
    "counter": counter,
    "isContinue": counter < max_retries
  }

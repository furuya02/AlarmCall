def lambda_handler(event, _context):
  
  print(event)

  counter = int(event["iterator"]["counter"])
  max_retries = int(event["maxRetries"])
  counter += 1
  return  {
    "counter": counter,
    "isContinue": (counter < max_retries)
  }

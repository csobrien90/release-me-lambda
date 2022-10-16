# HelloSign Interface

*A code repository for the AWS serverless lambda function that acts as an API for the Release Me Media Release Manager frontend React app*

## Actions, parameter, and response models

All requests must be a request in a standard JSON format, containing at least the `action` - and sometimes `auth` and/or `params` attribute, depending on the action:

```
const request = {
	"action": {(string) action},
	"auth": {
		"token": {(string) JWT},
	},
	"params": {(object) params}
}
```

### Create Account (action: createAccount)

- saves new user if email does not already have an account
- params:

```
{
	"email": {(string) email},
	"password": {(string) password},
}
```

### Get All Releases (action: getAllReleases)

- retrieves a summary of all a user's media releases
- requires auth token
- no params required


### Create/Update Release Data (action: saveRelease)

- saves newly created or updates existing release
- requires auth token
- params:

```
{
	"releaseId": {(string) 24-digit alphabetic ID},
	"title": {(string) title},
	"description": {(string) description},
	"senderInfo": {
		emailAddress: {(string) email},
		name: {(string) companyName}
	},
	"requestedSignatures": {(array) [
		{
			HelloSign Request
		},
		{...}
	]}
}
```

### Delete Release Data (action: deleteRelease)

- delete all data for a single release
- requires auth token
- params:

```
{"releaseId": {(string) 24-digit alphabetic ID} //required}
```


### Create Signature Request (action: signatureRequest)

- invoke HelloSign SDK to create a new signature request
- requires auth token
- params:

```
{
	"releaseId": {(string) 24-digit alphabetic ID}, //required
	"templateIds": {},
	"subject": {(string) subject},
	"message": {(string) message},
	"senderInfo": {
		emailAddress: {(string) email},
		name: {(string) companyName}
	},
	"signerInfo": {(array) [
		{
			emailAddress: {(string) email},
			name: {(string) companyName}
		},
		{...}
	]}
}
```

## Next steps and areas for improvement

### Overall Functionality

- Implement unit testing
- Improve error handling with try/catch wrapper functions
- Break index code into smaller, dependent files

### Data

- add time created/modified data to db changes

### Documentation

- Add endpoint info for login
- Define response data structures in this documentation
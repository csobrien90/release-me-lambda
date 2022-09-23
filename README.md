# HelloSign Interface

*A code repository for the AWS serverless lambda function that acts as an API for the Release Me Media Release Manager frontend React app*

## Actions, parameter, and response models

All requests must be a request in a standard JSON format, containing at least the `action` and `auth` attributes - and sometimes a `params` attribute, depending on the action:

```
const request = {
	"action": {(string) action},
	"auth": {
		"userId": {(int) userId},
		"token": {(string) JWT},
	},
	"params": {(object) params}
}
```

### Get All Releases (action: getAllReleases)

- retrieves a summary of all a user's media releases
- no params required


### Create/Update Release Data (action: saveRelease)

- saves newly created or updates existing release
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
- params:

```
{"releaseId": {(string) 24-digit alphabetic ID} //required}
```


### Create Signature Request (action: signatureRequest)

- invoke HelloSign SDK to create a new signature request
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

*Since the Release Me Media Release Manager is being created first and foremost for the HelloSign Hackathon and there is an impending hard deadline, this will serve, more than anything, as a proof of concept. Below is a sort of To Do list for future development on this application.*

- add time created/modified data to db changes
- Define response data structures in this documentation
- Flesh out authentication process
- Implement unit testing
- Improve error handling with try/catch wrapper function
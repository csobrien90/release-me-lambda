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

### Get Release Data (action: getRelease)

- retrieves all information for a single release
- params:

```
{"releaseId": {(string) 16-digit alphabetic ID} //required}
```

### Create/Update Release Data (action: saveRelease)

- saves newly created or updates existing release 
- params:

```
{
	"releaseId": {(string) 16-digit alphabetic ID}, //required
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
{"releaseId": {(string) 16-digit alphabetic ID} //required}
```


### Create Signature Request (action: signatureRequest)

- invoke HelloSign SDK to create a new signature request
- params:

```
{
	"releaseId": {(string) 16-digit alphabetic ID}, //required
	"templateIds": {},
	"subject": {(string) subject},
	"message": {(string) message},
	"signers": {(array) [
		{
			emailAddress: {(string) email},
			name: {(string) companyName}
		},
		{...}
	]}
}
```

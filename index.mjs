import * as HelloSignSDK from "hellosign-sdk";
import AWS from "aws-sdk";

export const handler = async (event) => {
	
	/*
	=========================
	Shared resources
	=========================
	*/
	
	const response = {};
	const validationError = {
		statusCode: 400,
		body: "Unable to process request due to invalid data"
	}

	let database = new AWS.DynamoDB.DocumentClient();
	const tableName = process.env.tableName;

	// Functions
	function validateParam(param, type) {

		let isValid = false;
		switch (type) {
			case 'releaseId':
				let regex = /^[a-zA-Z]{24}$/;
				isValid = regex.test(param);
				break;
			default:
				return null;
		}

		return isValid ? param : null;

	}

	// Validate request format
	let postData;
	try {
		postData = JSON.parse(event.body);
	} catch (err) {
		console.error(err);
		validationError.body += ' - request must be in JSON format';
		return validationError;
	}

	let auth, action, body;
	
	if (postData.hasOwnProperty('auth')) {
		auth = postData.auth;
	} else {
		validationError.body += ' - missing auth attribute';
		return validationError;
	}

	if (postData.hasOwnProperty('action')) {
		action = postData.action;
	} else {
		validationError.body += ' - missing action attribute';
		return validationError;
	}

	if (postData.hasOwnProperty('params')) {
		body = postData.params;
	} else if (action === 'getAllReleases') {
		body = null;
	} else {
		validationError.body += ' - missing required params attribute';
		return validationError;
	}
	

	/*
	=========================
	Authentication
	=========================
	*/
	
	// Verify reCaptcha
	// Sanitize and validate web token

	const userId = auth.userId;
	let isAuthenticated = auth.token === 12345;

	if (!isAuthenticated) {
		response.statusCode = 403;
		response.body = 'Access denied - authentication failed';
		return response;
	}


	/*
	=========================
	Get All Releases
	=========================
	*/
	
	if (action === 'getAllReleases') {

		// Call HelloSign to update all releases' signature status


		// Retrieve all release data from DB
		var params = {
			Key: {"userId": userId},
			TableName: tableName,
			AttributesToGet: ["releases"],
		}
		
		const result = await database.get(params).promise();

		response.statusCode = 200;
		response.body = JSON.stringify(result);
		return response;
	}


	/*
	=========================
	Save Release Data
	=========================
	*/

	// {
	// 	"releaseId": {(string) 24-digit alphabetic ID},
	// 	"title": {(string) title},
	// 	"description": {(string) description},
	// 	"senderInfo": {
	// 		emailAddress: {(string) email},
	// 		name: {(string) companyName}
	// 	},
	// 	"requestedSignatures": {(array) [
	// 		{
	// 			HelloSign Request
	// 		},
	// 		{...}
	// 	]}
	// }


	if (action === 'saveRelease') {

		// Validate and santize or create releaseId
		let releaseId;
		if (body.hasOwnProperty('releaseId')) { // Updating an existing release 
			releaseId = validateParam(body.releaseId, 'releaseId');
			delete body.releaseId;
		} else { // Creating new release
			// Generate 24-digit alphabetic code for new releaseId
			releaseId = '';
			var charset = "abcdefghijklmnopqrstuvwxyz";
			for (var i=0; i < 24; i++) releaseId += charset.charAt(Math.floor(Math.random() * charset.length));
		}

		// TODO: Validate other params


		// BUG: This update operation overwrites values that are not included - need to either get the item and alter before saving, or find a way to only alter included props

		// Update DB
		const params = {
			TableName: tableName,
			Key: {"userId": userId},
			UpdateExpression: `SET releases.${releaseId} = :releaseData`,
			ExpressionAttributeValues: {":releaseData": body}
		};

		const result = await database.update(params).promise();

		// Not getting a response? Need to find a way to determine DB success/failure

		response.statusCode = 200;
		response.body = 'Release data saved!';
		return response;
	}


	/*
	=========================
	Delete Release
	=========================
	*/

	if (action === 'deleteRelease') {
		
		// Validate and santize input		
		let releaseId = body.releaseId;

		// Update DB
		const params = {
			TableName: tableName,
			Key: {"userId": userId},
			UpdateExpression: `REMOVE releases.${releaseId}`,
		};

		const result = await database.update(params).promise();

		// Not getting a response? Need to find a way to determine DB success/failure

		response.statusCode = 200;
		response.body = 'Release data deleted!';
		return response;
	}


	/*
	=========================
	Handle Signature Request
	=========================
	*/

	if (action === 'signatureRequest') {
		
		// Validate and santize input
	
		// Send signature request
		const api = new HelloSignSDK.SignatureRequestApi();
		api.username = process.env.apiKey;
		
		const signer = {
			role: "Subject",
			emailAddress: "obrien.music@gmail.com",
			name: "Chad O'Brien",
		};
	
		const sender = {
			role: "Sender",
			emailAddress: "louisvillejazzinitiative@gmail.com",
			name: "Louisville Jazz Initiaitve",
		}
	
		const customField1 = {
			name: "CompanyName",
			value: sender.name,
			editor: sender.role,
			required: true,
		};
		
		const signingOptions = {
			draw: true,
			type: true,
			upload: true,
			phone: false,
			defaultType: "draw",
		};
	
		const data = {
			templateIds: ["105f1b83b3ab749ef39462a53c15290f8ba2af3a"],
			subject: "Media Release Form",
			message: "Please review and sign this media release form. Thank you!",
			signers: [ signer, sender ],
			customFields: [ customField1 ],
			signingOptions,
			testMode: true,
		};
	
		const result = await api.signatureRequestSendWithTemplate(data)
		.then((res) => {
			const signatureRequestResponse = res.body.signatureRequest;
			console.log('request:', signatureRequestResponse);
			
			// Save request in DB
	
			
			// Prepare response
			response.statusCode = 200;
			response.body = JSON.stringify(signatureRequestResponse);
			
		})
		.catch((err) => {
			console.error(err);
			response.statusCode = 500;
			response.body = 'Unable to complete signature request - something went wrong.'
		});
	
		return response;
	}

	return {
		statusCode: 500,
		body: 'Unable to route request due to invalid action.'
	};

};
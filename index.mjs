import * as HelloSignSDK from "hellosign-sdk";
import AWS from "aws-sdk";

export const handler = async (event) => {
	
	/*
	=========================
	Declare shared resources
	=========================
	*/
	
	const response = {};

	let database = new AWS.DynamoDB.DocumentClient();
	const tableName = process.env.tableName;

	const postData = JSON.parse(event.body);
	const auth = postData.auth;
	const action = postData.action;
	const body = postData.params;
	



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

		// Validate and santize input
		// Retrieve summary of all releases from DB

		response.statusCode = 200;
		response.body = 'Here is a summary of all the releases!';
		return response;
	}


	/*
	=========================
	Get Single Release
	=========================
	*/

	if (action === 'getRelease') {

		// Validate and santize input
		let releaseId = body.releaseId;

		// Call HelloSign to update release signature status in DB
		// Return updated release data

		response.statusCode = 200;
		response.body = 'Here is all data for this single release!';
		return response;
	}


	/*
	=========================
	Save Release Data
	=========================
	*/

	if (action === 'saveRelease') {

		// Validate and santize input
		let releaseId = body.releaseId;
		
		// Update DB
		const params = {
			TableName: tableName,
			Key: {"userId": userId},
			UpdateExpression: `SET releases.${releaseId} = :releaseData`,
			ExpressionAttributeValues: {
				":releaseData": {
					"testKey1": "testValue1",
					"testKey2": "testValue2"
				}
			}
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
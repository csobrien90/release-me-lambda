import * as HelloSignSDK from "hellosign-sdk";
import AWS from "aws-sdk";

export const handler = async (event) => {
	
	/*
	=========================
	Shared resources
	=========================
	*/
	
	const response = {
		headers: {
            "Access-Control-Allow-Headers" : "Content-Type",
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "OPTIONS,POST"
        }
	};
	const validationError = {
		headers: response.headers,
		statusCode: 400,
		body: "Unable to process request due to invalid data"
	}

	let database = new AWS.DynamoDB.DocumentClient();
	const tableName = process.env.tableName;

	// Functions
	function validateParam(param, type) {

		let isValid = false;
		let regex;

		switch (type) {
			case 'releaseId':
				//  24 alphabetic digits
				regex = /^[a-zA-Z]{24}$/;
				isValid = regex.test(param);
				break;
			case 'title':
			case 'description':
			case 'name':
				// any number and combination of alphanumeric characters, special characters, and spaces
				regex = /^[a-zA-Z0-9.,\/'";:\]}!@#$%^&*()_\-+= ]{1,}$/;
				isValid = regex.test(param);
				break;
			case 'email':
				//  a valid email
				regex = /^[a-zA-Z0-9._-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,4}$/;
				isValid = regex.test(param);
				break;
			case 'senderInfo':
				let isObject = typeof param === 'object';
				let hasTwoProps = Object.keys(param).length === 2;
				let hasValidEmail = param.hasOwnProperty('emailAddress') && validateParam(param.emailAddress, 'email');
				let hasValidName = param.hasOwnProperty('name') && validateParam(param.name, 'name');
				isValid = isObject && hasTwoProps && hasValidEmail && hasValidName;
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
		console.log('===starting getAllReleases===');

		// Retrieve all release data from DB
		const params = {
			Key: {"userId": userId},
			TableName: tableName,
			AttributesToGet: ["releases"],
		}
		
		const result = await database.get(params).promise();
		const releases = result.Item.releases;

		// Call HelloSign to update all releases' signature status
		const api = new HelloSignSDK.SignatureRequestApi();
		api.username = process.env.apiKey;

		let releaseIds = Object.keys(releases);
		for (let releaseId of releaseIds) {
			for (let request of releases[releaseId].requestedSignatures) {
				let helloSignResult;
				try {
					helloSignResult = await api.signatureRequestGet(request.signatureRequestId);
					console.log("helloSignResult for ", request.signatureRequestId, ": ", helloSignResult);
					request = helloSignResult.body.signatureRequest;
				} catch (error) {
					console.log('An error occured during the hellosign update request');
					console.error(error);
				};
			}
		}
		
		// // Save updated signature data in DB
		const databaseParams = {
			TableName: tableName,
			Key: {"userId": userId},
			UpdateExpression: `SET releases = :fullReleaseData`,
			ExpressionAttributeValues: {
				":fullReleaseData": releases
			}
		};

		const updateResult = await database.update(databaseParams).promise();

		console.log("new releases: ", releases);
		result.Item.releases = releases;		

		response.statusCode = 200;
		response.body = JSON.stringify(result);
		return response;
	}


	/*
	=========================
	Save Release Data
	=========================
	*/

	if (action === 'saveRelease') {
		console.log('===starting saveRelease===');

		// Validate and santize or create releaseId
		let releaseId;
		let releaseData = {};
		let updateExpressionDraft = 'SET';

		if (body.hasOwnProperty('releaseId')) { // Updating an existing release 
			releaseId = validateParam(body.releaseId, 'releaseId');
			delete body.releaseId;
		} else { // Creating new release
			// Generate 24-digit alphabetic code for new releaseId
			releaseId = '';
			var charset = "abcdefghijklmnopqrstuvwxyz";
			for (var i=0; i < 24; i++) releaseId += charset.charAt(Math.floor(Math.random() * charset.length));

			let createReleaseParams = {
				TableName: tableName,
				Key: {"userId": userId},
				UpdateExpression: `SET releases.${releaseId} = :object`,
				ExpressionAttributeValues: {":object": {"requestedSignatures": []}}
			};
	
			let createRelease = await database.update(createReleaseParams).promise();
			if (!createRelease) {
				response.statusCode = 500;
				response.body = "Release could not be created.";
				return response;
			};

			releaseData[':created'] = Date.now();
			updateExpressionDraft += ` releases.${releaseId}.created = :created,`;
			
		}
		
		let path = `releases.${releaseId}`;
		releaseData[':modified'] = Date.now();
		updateExpressionDraft += ` ${path}.modified = :modified,`;

		// Validate other params and determine what needs saving
		if (body.hasOwnProperty('title')) { 
			let title = validateParam(body.title, 'title');
			if (title) {
				releaseData[':title'] = title;
				updateExpressionDraft += ` ${path}.title = :title,`;
			}
		}

		if (body.hasOwnProperty('description')) { 
			let description = validateParam(body.description, 'description');
			if (description) {
				releaseData[':description'] = description;
				updateExpressionDraft += ` ${path}.description = :description,`;
			}
		}

		if (body.hasOwnProperty('senderInfo')) { 
			let senderInfo = validateParam(body.senderInfo, 'senderInfo');
			if (senderInfo) {
				releaseData[':senderInfo'] = senderInfo;
				updateExpressionDraft += ` ${path}.senderInfo = :senderInfo,`;
			}
		}

		const updateExpression = updateExpressionDraft.slice(0, -1);
		if (updateExpression.length < 4) {
			validationError.body += ' - update request cannot be empty';
			return validationError;
		}

		// Update DB
		const params = {
			TableName: tableName,
			Key: {"userId": userId},
			UpdateExpression: updateExpression,
			ExpressionAttributeValues: releaseData
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
		console.log('===starting deleteRelease===');

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
		console.log('===starting signatureRequest===');

		// Validate and santize input		
		let releaseId = body.releaseId;
		const subject = body.subject;
		const message = body.message;
		const signers = body.signerInfo;
		const sender = body.senderInfo;

		// Construct call parameters {role, emailAddress, name}
		signers.forEach(signer => signer.role = "Subject");
		sender.role = "Sender";

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
			subject,
			message,
			signers: [ ...signers, sender ],
			customFields: [ customField1 ],
			signingOptions,
			testMode: true,
		};

		// Send signature request
		const api = new HelloSignSDK.SignatureRequestApi();
		api.username = process.env.apiKey;
	
		const result = await api.signatureRequestSendWithTemplate(data)
		.then(async (res) => {
			const signatureRequestResponse = res.body.signatureRequest;
			console.log('request:', signatureRequestResponse);
			
			// Save request in DB
			let requestedSignaturesArray = `releases.${releaseId}.requestedSignatures`;
			const params = {
				TableName: tableName,
				Key: {"userId": userId},
				UpdateExpression: `SET ${requestedSignaturesArray} = list_append(${requestedSignaturesArray}, :signatureRequest)`,
				ExpressionAttributeValues: {
					":signatureRequest": [signatureRequestResponse]
				}
			};
	
			const updateResult = await database.update(params).promise();

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
		statusCode: 403,
		body: 'Unable to route request due to invalid action.'
	};

};
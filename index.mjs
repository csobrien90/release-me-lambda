import './env.mjs';
import * as HelloSignSDK from "hellosign-sdk";
import AWS from "aws-sdk";

import jwt from 'jsonwebtoken';
import bcryptjs from 'bcryptjs';
const { genSalt, hash, compare } = bcryptjs;

export const handler = async (event) => {
	try {

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
			case 'userId':
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


	/*
	=========================
	Initial validation and verification
	=========================
	*/
	
	// Validate request format
	let postData, action, body;

	try {
		postData = JSON.parse(event.body);
	} catch (err) {
		console.error(err);
		validationError.body += ' - request must be in JSON format';
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
	

	// Verify reCaptcha



	
	/*
	=========================
	Account Actions
	=========================
	*/
	
	if (action === 'createAccount') {
		console.log('===starting createAccount===');

		// TODO: Validate and santize input		
		const email = body.email;
		const password = body.password;

		// Return error if email already exists in DB
		const isAlreadyRegisteredParams = {
			Key: {"username": email},
			TableName: tableName,
			IndexName: 'email-index',
			KeyConditionExpression: 'email = :email', 
			ExpressionAttributeValues: { ':email': email },
		}

		const isAlreadyRegistered = await database.query(isAlreadyRegisteredParams).promise();

		if ( isAlreadyRegistered.Count !== 0 ) {
			response.statusCode = 422;
			response.body = 'Account creation failed - a user with that email already exists';
			return response;
		}
		
		// Generate salt and hash password
		const salt = await genSalt(10);
		const hashedPassword = await hash(password, salt);

		// Create new userId
		let newUserId = '';
		let charset = "1234567890";
		for (let i=0; i < 12; i++) newUserId += charset.charAt(Math.floor(Math.random() * charset.length));

		// TODO: Make sure newUserId does not already exist

		// Save new user in DB
		const databaseParams = {
			TableName: tableName,
			Item: {
				'userId': +newUserId,
				email,
				'password': hashedPassword,
				'sessionId': '',
				'releases': {}
			}
		};

		const registerResult = await database.put(databaseParams).promise();

		response.statusCode = 200;
		response.body = 'Account created successfully!';
		return response;
	}

	if (action === 'login') {
		console.log('===starting login===');

		// TODO: Validate and santize input		
		const email = body.email;
		const password = body.password;

		// Get userData from DB
		const userDataParams = {
			Key: {"username": email},
			TableName: tableName,
			IndexName: 'email-index',
			KeyConditionExpression: 'email = :email', 
			ExpressionAttributeValues: { ':email': email },
		}

		const userData = await database.query(userDataParams).promise();

		if ( userData.Count === 0 ) {
			response.statusCode = 400;
			response.body = 'Login failed - no user with that email address';
			return response;
		} else if ( userData.Count > 1 ) {
			response.statusCode = 400;
			response.body = 'Login failed - multiple users found with that email address';
			return response;
		}
		
		// Compare passwords and return error if not a match
		const savedPassword = userData.Items[0].password;
		const isAuthorized = await compare(password, savedPassword);

		if (!isAuthorized) {
			response.statusCode = 400;
			response.body = 'Login failed - check you password and try again';
			return response;
		}

		// Generate sessionId
		let sessionId = '';
		let charset = "abcdefghijklmnopqrstuvwxyz1234567890";
		for (let i=0; i < 24; i++) sessionId += charset.charAt(Math.floor(Math.random() * charset.length));	

		// Save sessionId in DB
		const userId = userData.Items[0].userId;
		const sessionUpdateParams = {
			TableName: tableName,
			Key: {"userId": userId},
			UpdateExpression: 'SET #attr = :sessionId',
			ExpressionAttributeNames: {'#attr': 'sessionId'},
			  ExpressionAttributeValues: {":sessionId": sessionId}
		};
				
		try {
			const result = await database.update(sessionUpdateParams).promise();
		} catch (e) {
			console.error(e);

			response.statusCode = 400;
			response.body = 'Session could not be created!';
			return response;
		}

		// Create JWT
		const accessJWT = jwt.sign({
			sessionId,
			userId
		}, process.env.jwtSecret);

		response.statusCode = 200;
		response.body = JSON.stringify({message: 'Login successful!', accessJWT});
		return response;
	}


	/*
	=========================
	Authentication
	=========================
	*/

	// Confirm that params has an auth property
	let auth;
	if (postData.hasOwnProperty('auth')) {
		auth = postData.auth;
	} else {
		validationError.body += ' - missing auth attribute';
		return validationError;
	}

	// TODO: Validate and sanitize user input
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
			let requestedSignatures = [];
			for (let request of releases[releaseId].requestedSignatures) {
				let helloSignResult;
				try {
					helloSignResult = await api.signatureRequestGet(request.signatureRequestId);
					console.log("helloSignResult for ", request.signatureRequestId, ": ", helloSignResult);
					requestedSignatures.push(helloSignResult.body.signatureRequest);
				} catch (error) {
					if (error.statusCode && error.statusCode === 410) {
						console.log(`Request ${request.signatureRequestId} no longer exists!`);
					} else {
						console.log('An error occured during the hellosign update request');
						console.error(error);
					}
				};
			}
			releases[releaseId].requestedSignatures = requestedSignatures;
		}
		
		// Save updated signature data in DB
		const databaseParams = {
			TableName: tableName,
			Key: {"userId": userId},
			UpdateExpression: `SET releases = :fullReleaseData`,
			ExpressionAttributeValues: {
				":fullReleaseData": releases
			}
		};

		try {
			const updateResult = await database.update(databaseParams).promise();
		} catch (error) {
			console.log('DB update failed!');
			console.error(error);
		}

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

		// TODO: Validate and santize input		
		let releaseId = body.releaseId;

		// Call Hellosign to delete request(s)

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
	Delete Request
	=========================
	*/

	if (action === 'deleteRequest') {
		console.log('===starting deleteRequest===');

		// TODO: Validate and santize input	
		const releaseId = body.releaseId;	
		const signatureRequestId = body.requestId;
		
		// Send signature request
		const api = new HelloSignSDK.SignatureRequestApi();
		api.username = process.env.apiKey;
		
		// Call Hellosign to delete request
		let result;
		try {
			result = await api.signatureRequestCancel(signatureRequestId)
		} catch (error) {
			console.error(error);
			return {
				statusCode: 500,
				body: 'Exception when calling HelloSign API'
			}
		}
		
		console.log('result:', result);
		response.statusCode = 200;
		response.body = 'Request deleted!';

		return response;
	}


	/*
	=========================
	Handle Signature Request
	=========================
	*/

	if (action === 'signatureRequest') {
		console.log('===starting signatureRequest===');

		// TODO: Validate and santize input		
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
			customFields: [ customField1 ],
			signingOptions,
			testMode: true,
		};

		// Send signature request
		const api = new HelloSignSDK.SignatureRequestApi();
		api.username = process.env.apiKey;
	
		let isSuccess = true
		for (let signer of signers) {
			data.signers = [signer, sender];
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
				isSuccess = isSuccess && true;
			})
			.catch((err) => {
				console.error(err);
				isSuccess = false;
			});
		}

		// Prepare response;
		if (isSuccess) {
			response.statusCode = 200;
			response.body = 'All requests have been made!'
		} else {
			response.statusCode = 500;
			response.body = 'Unable to complete some/all signature requests - something went wrong.'
		}

		return response;
	}

	
	/*
	=========================
	Send Reminder Email
	=========================
	*/

	if (action === 'sendReminder') {
		console.log('===starting sendReminder===');

		// TODO: Validate and santize input	
		const email = {emailAddress: body.emailAddress};	
		const signatureRequestId = body.requestId;
		
		// Send signature request
		const api = new HelloSignSDK.SignatureRequestApi();
		api.username = process.env.apiKey;
		
		// Call Hellosign to send reminder
		let result;
		try {
			result = await api.signatureRequestRemind(signatureRequestId, email);
		} catch (error) {
			console.error(error);
			return {
				statusCode: 500,
				body: 'Exception when calling HelloSign API'
			}
		}
		
		console.log('result:', result);
		response.statusCode = 200;
		response.body = 'Reminder sent!';

		return response;
	}


	/*
	=========================
	Get Signature File
	=========================
	*/

	if (action === 'getSignatureFile') {
		console.log('===starting getSignatureFile===');

		// TODO: Validate and santize input	
		const signatureRequestId = body.requestId;
		
		// Send signature request
		const api = new HelloSignSDK.SignatureRequestApi();
		api.username = process.env.apiKey;
		
		// Call Hellosign to send reminder
		let result;
		try {
			result = await api.signatureRequestFiles(signatureRequestId, 'pdf', true);
		} catch (error) {
			console.error(error);
			return {
				statusCode: 500,
				body: 'Exception when calling HelloSign API'
			}
		}
		
		console.log('result:', result);
		response.statusCode = 200;
		response.body = JSON.stringify({fileUrl: result.body.fileUrl});

		return response;
	}
	

	// Return 403 error if invalid action
	return {
		statusCode: 403,
		body: 'Unable to route request due to invalid action.'
	};

} catch (e) {
	console.error(e);
}

};
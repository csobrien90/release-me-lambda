import * as HelloSignSDK from "hellosign-sdk";

export const handler = async (event) => {
	const response = {};

	// Santize input

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

};
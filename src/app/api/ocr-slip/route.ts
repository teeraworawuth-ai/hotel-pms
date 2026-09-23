import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get('slip') as File;
    
    if (!file) {
      return NextResponse.json({ error: 'No image provided' }, { status: 400 });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'API Key not configured' }, { status: 500 });
    }

    // Convert file to base64
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    const base64Image = buffer.toString('base64');
    const mimeType = file.type || 'image/jpeg';

    const genAI = new GoogleGenerativeAI(apiKey);
    // Use Gemini 1.5 Flash for fast multimodal OCR
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

    const prompt = `
    Analyze this Thai bank transfer slip image.
    Extract the following details and return ONLY a valid JSON object without any markdown formatting or extra text.
    
    Required JSON schema:
    {
      "amount": number (e.g. 1500.50),
      "date": "YYYY-MM-DD" (convert Buddhist year to Gregorian if necessary),
      "time": "HH:mm" (e.g. "14:30"),
      "sender_bank": string (name of the sender's bank or account),
      "receiver_bank": string (name of the receiver's bank or account)
    }
    `;

    const result = await model.generateContent([
      prompt,
      {
        inlineData: {
          data: base64Image,
          mimeType: mimeType
        }
      }
    ]);

    const text = result.response.text();
    // Clean up potential markdown formatting (```json ... ```)
    const jsonStr = text.replace(/```json/g, '').replace(/```/g, '').trim();
    
    let data;
    try {
      data = JSON.parse(jsonStr);
    } catch (e) {
      console.error("Failed to parse JSON:", jsonStr);
      return NextResponse.json({ error: 'AI failed to output valid JSON' }, { status: 500 });
    }

    return NextResponse.json(data);

  } catch (error: any) {
    console.error('OCR Error:', error);
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}

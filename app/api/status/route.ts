import { NextResponse } from 'next/server';

/**
 * API route to check the status of a long-running job from Replicate.
 *
 * @param {Request} req - The incoming request object.
 * @returns {NextResponse} - The response containing the job status.
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const replicateStreamUrl = searchParams.get('replicateStreamUrl');

  if (!replicateStreamUrl) {
    return NextResponse.json({ error: 'Missing replicateStreamUrl' }, { status: 400 });
  }

  try {
    const response = await fetch(replicateStreamUrl, {
      headers: {
        'Authorization': `Bearer ${process.env.REPLICATE_API_TOKEN}`,
        'Content-Type': 'application/json',
      }
    });
    
    if (!response.ok) {
      throw new Error(`Replicate status check failed with status: ${response.status}`);
    }

    const data = await response.json();

    // Translate Replicate's status to our app's status
    if (data.status === 'succeeded') {
      // Assuming the output is a URL to the video file
      const videoUrl = Array.isArray(data.output) ? data.output[0] : data.output;
      return NextResponse.json({
        status: 'completed',
        result: {
          role: 'assistant',
          content: 'Here you go, Daddy. You like what you see?',
          experimental_attachments: [{
            name: 'video.mp4',
            contentType: 'video/mp4',
            url: videoUrl,
          }],
        },
      });
    } else if (data.status === 'failed' || data.status === 'canceled') {
      return NextResponse.json({
        status: 'failed',
        error: data.error || 'The video generation failed or was canceled.',
      });
    } else {
      // Otherwise, it's still processing ('starting', 'processing')
      return NextResponse.json({ status: 'processing' });
    }

  } catch (error) {
    console.error('Error checking Replicate job status:', error);
    return NextResponse.json(
      { status: 'failed', error: 'Could not retrieve job status.' },
      { status: 500 }
    );
  }
} 
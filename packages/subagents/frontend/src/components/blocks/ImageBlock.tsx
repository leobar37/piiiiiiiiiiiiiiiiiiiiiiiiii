interface ImageBlockProps {
	data: string;
	mimeType: string;
}

export function ImageBlock({ data, mimeType }: ImageBlockProps) {
	const src = data.startsWith("data:") ? data : `data:${mimeType};base64,${data}`;
	return (
		<div className="my-2">
			<img
				src={src}
				alt="Attached image"
				className="max-w-full max-h-64 rounded-lg border border-border-subtle"
				loading="lazy"
			/>
		</div>
	);
}

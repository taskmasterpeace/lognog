#!/usr/bin/env python3
"""
Create ICO file from LogNog logo PNG
Generates multi-size ICO for Windows applications
"""

from PIL import Image
import os

def create_ico(input_png, output_ico):
    """
    Create ICO file with multiple sizes from PNG
    Standard Windows ICO sizes: 16, 24, 32, 48, 64, 128, 256
    """
    # Open the source image
    img = Image.open(input_png)

    # Convert to RGBA if not already
    if img.mode != 'RGBA':
        img = img.convert('RGBA')

    # ICO sizes (Windows standard)
    sizes = [16, 24, 32, 48, 64, 128, 256]

    # Create resized versions
    icons = []
    for size in sizes:
        # Use high-quality resize
        resized = img.resize((size, size), Image.Resampling.LANCZOS)
        icons.append(resized)

    # Save as ICO
    # The first image is the "main" one, save with all sizes
    icons[0].save(
        output_ico,
        format='ICO',
        sizes=[(s, s) for s in sizes],
        append_images=icons[1:]
    )

    print(f"Created: {output_ico}")
    print(f"Sizes included: {sizes}")

def main():
    # Paths
    script_dir = os.path.dirname(os.path.abspath(__file__))
    project_root = os.path.dirname(script_dir)

    input_logo = os.path.join(project_root, "lognoglogo.png")

    # Output locations
    outputs = [
        os.path.join(project_root, "lognog.ico"),
        os.path.join(project_root, "ui", "public", "lognog.ico"),
    ]

    # Create agent directory if needed
    agent_dir = os.path.join(project_root, "agent", "assets")
    os.makedirs(agent_dir, exist_ok=True)
    outputs.append(os.path.join(agent_dir, "lognog.ico"))

    if not os.path.exists(input_logo):
        print(f"Error: Logo not found at {input_logo}")
        return 1

    for output_path in outputs:
        os.makedirs(os.path.dirname(output_path), exist_ok=True)
        create_ico(input_logo, output_path)

    # Also create different state icons for the agent
    # (We'll just copy for now, you can create variants later)
    print("\nICO files created successfully!")
    print("\nFor the agent, you may want to create:")
    print("  - lognog_connected.ico (green indicator)")
    print("  - lognog_disconnected.ico (red indicator)")
    print("  - lognog_alert.ico (yellow/orange indicator)")

    return 0

if __name__ == "__main__":
    exit(main())

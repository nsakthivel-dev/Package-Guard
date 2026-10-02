Add-Type -TypeDefinition @"
using System;
using System.IO;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Imaging;
using System.Collections.Generic;

public class IcoGenerator
{
    private class IconFrame
    {
        public int Width;
        public int Height;
        public byte[] Data;
        public bool IsPng;
    }

    public static void CreateIco(string sourcePngPath, string outputIcoPath)
    {
        using (var srcImage = Image.FromFile(sourcePngPath))
        {
            var frames = new List<IconFrame>();

            // Sizes to generate
            int[] dibSizes = new int[] { 16, 24, 32, 48, 64 };
            int[] pngSizes = new int[] { 128, 256 };

            foreach (int size in dibSizes)
            {
                using (var resized = ResizeImage(srcImage, size, size))
                {
                    frames.Add(new IconFrame
                    {
                        Width = size,
                        Height = size,
                        Data = CreateDibData(resized),
                        IsPng = false
                    });
                }
            }

            foreach (int size in pngSizes)
            {
                using (var resized = ResizeImage(srcImage, size, size))
                {
                    using (var ms = new MemoryStream())
                    {
                        resized.Save(ms, ImageFormat.Png);
                        frames.Add(new IconFrame
                        {
                            Width = size,
                            Height = size,
                            Data = ms.ToArray(),
                            IsPng = true
                        });
                    }
                }
            }

            // Write ICO file
            using (var fs = new FileStream(outputIcoPath, FileMode.Create, FileAccess.Write))
            using (var bw = new BinaryWriter(fs))
            {
                // ICONDIR header
                bw.Write((ushort)0); // Reserved
                bw.Write((ushort)1); // Resource type (1 = ICO)
                bw.Write((ushort)frames.Count); // Number of images

                // Calculate image data start offset
                int headerSize = 6;
                int dirEntrySize = 16;
                int currentOffset = headerSize + (frames.Count * dirEntrySize);

                // Write ICONDIRENTRY for each frame
                foreach (var frame in frames)
                {
                    bw.Write((byte)(frame.Width >= 256 ? 0 : frame.Width));
                    bw.Write((byte)(frame.Height >= 256 ? 0 : frame.Height));
                    bw.Write((byte)0); // Color count
                    bw.Write((byte)0); // Reserved
                    bw.Write((ushort)1); // Color planes
                    bw.Write((ushort)32); // Bits per pixel
                    bw.Write((uint)frame.Data.Length); // Size of image data
                    bw.Write((uint)currentOffset); // Offset of image data

                    currentOffset += frame.Data.Length;
                }

                // Write actual image data for each frame
                foreach (var frame in frames)
                {
                    bw.Write(frame.Data);
                }
            }
        }
    }

    private static Bitmap ResizeImage(Image image, int width, int height)
    {
        var destBitmap = new Bitmap(width, height, PixelFormat.Format32bppArgb);
        destBitmap.SetResolution(image.HorizontalResolution, image.VerticalResolution);

        using (var graphics = Graphics.FromImage(destBitmap))
        {
            graphics.CompositingMode = CompositingMode.SourceCopy;
            graphics.CompositingQuality = CompositingQuality.HighQuality;
            graphics.InterpolationMode = InterpolationMode.HighQualityBicubic;
            graphics.SmoothingMode = SmoothingMode.HighQuality;
            graphics.PixelOffsetMode = PixelOffsetMode.HighQuality;

            graphics.Clear(Color.Transparent);
            graphics.DrawImage(image, 0, 0, width, height);
        }

        return destBitmap;
    }

    private static byte[] CreateDibData(Bitmap bmp)
    {
        int width = bmp.Width;
        int height = bmp.Height;

        // In ICO DIB, height in BITMAPINFOHEADER is doubled
        int biHeight = height * 2;

        int andRowBytes = ((width + 31) / 32) * 4;
        int andMaskSize = andRowBytes * height;
        int xorSize = width * height * 4;
        int headerSize = 40; // sizeof(BITMAPINFOHEADER)

        byte[] dib = new byte[headerSize + xorSize + andMaskSize];

        using (var ms = new MemoryStream(dib))
        using (var bw = new BinaryWriter(ms))
        {
            // BITMAPINFOHEADER
            bw.Write((uint)headerSize);
            bw.Write(width);
            bw.Write(biHeight);
            bw.Write((ushort)1);      // biPlanes
            bw.Write((ushort)32);     // biBitCount
            bw.Write((uint)0);        // biCompression (BI_RGB)
            bw.Write((uint)(xorSize + andMaskSize)); // biSizeImage
            bw.Write(0);              // biXPelsPerMeter
            bw.Write(0);              // biYPelsPerMeter
            bw.Write((uint)0);        // biClrUsed
            bw.Write((uint)0);        // biClrImportant

            // XOR mask (bottom-to-top 32bpp ARGB -> BGRA)
            BitmapData bmpData = bmp.LockBits(
                new Rectangle(0, 0, width, height),
                ImageLockMode.ReadOnly,
                PixelFormat.Format32bppArgb
            );

            try
            {
                byte[] row = new byte[width * 4];
                for (int y = height - 1; y >= 0; y--)
                {
                    IntPtr rowPtr = IntPtr.Add(bmpData.Scan0, y * bmpData.Stride);
                    System.Runtime.InteropServices.Marshal.Copy(rowPtr, row, 0, width * 4);
                    bw.Write(row);
                }
            }
            finally
            {
                bmp.UnlockBits(bmpData);
            }

            // AND mask (bottom-to-top 1bpp)
            // 0 = opaque/semitransparent, 1 = fully transparent (A == 0)
            for (int y = height - 1; y >= 0; y--)
            {
                byte[] andRow = new byte[andRowBytes];
                for (int x = 0; x < width; x++)
                {
                    Color pixel = bmp.GetPixel(x, y);
                    if (pixel.A == 0)
                    {
                        int byteIdx = x / 8;
                        int bitIdx = 7 - (x % 8);
                        andRow[byteIdx] |= (byte)(1 << bitIdx);
                    }
                }
                bw.Write(andRow);
            }
        }

        return dib;
    }
}
"@ -ReferencedAssemblies System.Drawing

$source = Join-Path $PSScriptRoot "..\93ab66ce-5cc7-4bd3-8286-325a5a5e8ddc.png"
$buildDir = Join-Path $PSScriptRoot "..\build"
$destPng = Join-Path $buildDir "icon.png"
$destIco = Join-Path $buildDir "icon.ico"
$publicLogo = Join-Path $PSScriptRoot "..\apps\desktop\renderer\public\logo.png"

# Copy PNG to build/icon.png and public/logo.png
Copy-Item -Path $source -Destination $destPng -Force
Copy-Item -Path $source -Destination $publicLogo -Force

# Generate proper multi-resolution 32-bit ICO
[IcoGenerator]::CreateIco($source, $destIco)

Write-Output "Successfully generated multi-resolution 32-bit icon.ico and icon.png"

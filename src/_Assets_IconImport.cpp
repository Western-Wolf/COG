#include "pch.h"
#include "_Assets_IconImport.h"

#include <algorithm>
#include <cctype>
#include <cstdint>
#include <cstring>
#include <cwchar>
#include <cwctype>
#include <fstream>
#include <iterator>
#include <vector>

#ifndef WIN32_LEAN_AND_MEAN
#	define WIN32_LEAN_AND_MEAN
#endif
#include <Windows.h>

#include <wincodec.h>
#include <wrl/client.h>

#pragma comment(lib, "windowscodecs.lib")
#pragma comment(lib, "ole32.lib")

using Microsoft::WRL::ComPtr;

namespace
{
	std::filesystem::path DataRoot()
	{
		return std::filesystem::current_path() / "Data";
	}

	/** MO2/USVFS: is_regular_file can miss mapped files that still open for read. */
	bool FileReadable(const std::filesystem::path& path)
	{
		std::error_code ec;
		if (std::filesystem::is_regular_file(path, ec) && !ec) {
			return true;
		}
		std::ifstream in(path, std::ios::binary);
		if (in) {
			return true;
		}
		const DWORD attr = GetFileAttributesW(path.c_str());
		return attr != INVALID_FILE_ATTRIBUTES && (attr & FILE_ATTRIBUTE_DIRECTORY) == 0;
	}

	bool PathEscapesData(const std::filesystem::path& candidate, const std::filesystem::path& dataRoot)
	{
		// Lexical containment only. weakly_canonical resolves through MO2 to mods\…,
		// which looks "outside Data" even when the logical path is Data\Interface\….
		const auto rel = candidate.lexically_normal().lexically_relative(dataRoot.lexically_normal());
		if (rel.empty()) {
			return true;
		}
		for (const auto& part : rel) {
			if (part == "..") {
				return true;
			}
		}
		return false;
	}

	std::string SanitizeToken(std::string_view in)
	{
		std::string out;
		out.reserve(in.size());
		for (unsigned char c : in) {
			if (std::isalnum(c) || c == '-' || c == '_' || c == '.') {
				out.push_back(static_cast<char>(c));
			} else if (c == ' ') {
				out.push_back('_');
			} else {
				out.push_back('_');
			}
		}
		if (out.empty()) {
			out = "_";
		}
		return out;
	}

	std::wstring ToWide(const std::filesystem::path& p)
	{
		return p.wstring();
	}

	std::string LowerExt(const std::filesystem::path& p)
	{
		auto e = p.extension().string();
		std::transform(e.begin(), e.end(), e.begin(), [](unsigned char c) {
			return static_cast<char>(std::tolower(c));
		});
		return e;
	}

	bool IsCopyAsIs(const std::string& ext)
	{
		return ext == ".gif" || ext == ".png" || ext == ".webp" || ext == ".jpg" || ext == ".jpeg" ||
		       ext == ".svg";
	}

	bool CopyFileTo(const std::filesystem::path& src, const std::filesystem::path& dst)
	{
		std::error_code ec;
		std::filesystem::create_directories(dst.parent_path(), ec);
		ec.clear();
		std::filesystem::copy_file(src, dst, std::filesystem::copy_options::overwrite_existing, ec);
		if (!ec) {
			return true;
		}
		// MO2/USVFS: overwrite_existing often fails when the dest already lives in overwrite.
		// Remove + copy, then fall back to a stream write.
		ec.clear();
		std::filesystem::remove(dst, ec);
		ec.clear();
		std::filesystem::copy_file(src, dst, std::filesystem::copy_options::overwrite_existing, ec);
		if (!ec) {
			return true;
		}
		std::ifstream in(src, std::ios::binary);
		if (!in) {
			return false;
		}
		std::ofstream out(dst, std::ios::binary | std::ios::trunc);
		if (!out) {
			return false;
		}
		out << in.rdbuf();
		out.flush();
		return static_cast<bool>(out);
	}

	bool EncodePngFromWicFrame(IWICImagingFactory* factory, IWICBitmapSource* source, const std::filesystem::path& dst)
	{
		ComPtr<IWICBitmapSource> converted;
		HRESULT hr = WICConvertBitmapSource(GUID_WICPixelFormat32bppBGRA, source, &converted);
		if (FAILED(hr) || !converted) {
			return false;
		}

		ComPtr<IWICStream> stream;
		hr = factory->CreateStream(&stream);
		if (FAILED(hr)) {
			return false;
		}
		hr = stream->InitializeFromFilename(ToWide(dst).c_str(), GENERIC_WRITE);
		if (FAILED(hr)) {
			return false;
		}

		ComPtr<IWICBitmapEncoder> encoder;
		hr = factory->CreateEncoder(GUID_ContainerFormatPng, nullptr, &encoder);
		if (FAILED(hr)) {
			return false;
		}
		hr = encoder->Initialize(stream.Get(), WICBitmapEncoderNoCache);
		if (FAILED(hr)) {
			return false;
		}

		ComPtr<IWICBitmapFrameEncode> frame;
		ComPtr<IPropertyBag2> props;
		hr = encoder->CreateNewFrame(&frame, &props);
		if (FAILED(hr)) {
			return false;
		}
		hr = frame->Initialize(props.Get());
		if (FAILED(hr)) {
			return false;
		}

		UINT w = 0;
		UINT h = 0;
		converted->GetSize(&w, &h);
		hr = frame->SetSize(w, h);
		if (FAILED(hr)) {
			return false;
		}
		WICPixelFormatGUID fmt = GUID_WICPixelFormat32bppBGRA;
		hr = frame->SetPixelFormat(&fmt);
		if (FAILED(hr)) {
			return false;
		}
		hr = frame->WriteSource(converted.Get(), nullptr);
		if (FAILED(hr)) {
			return false;
		}
		hr = frame->Commit();
		if (FAILED(hr)) {
			return false;
		}
		hr = encoder->Commit();
		return SUCCEEDED(hr);
	}

	bool EncodePngFromBgra(
		IWICImagingFactory* factory,
		const std::uint8_t* bgra,
		std::uint32_t width,
		std::uint32_t height,
		const std::filesystem::path& dst)
	{
		if (!factory || !bgra || width == 0 || height == 0) {
			return false;
		}
		ComPtr<IWICBitmap> bitmap;
		const UINT stride = width * 4u;
		const UINT bufferSize = stride * height;
		HRESULT hr = factory->CreateBitmapFromMemory(
			width,
			height,
			GUID_WICPixelFormat32bppBGRA,
			stride,
			bufferSize,
			const_cast<BYTE*>(reinterpret_cast<const BYTE*>(bgra)),
			&bitmap);
		if (FAILED(hr) || !bitmap) {
			return false;
		}
		return EncodePngFromWicFrame(factory, bitmap.Get(), dst);
	}

	std::uint32_t ReadU32(const std::uint8_t* p)
	{
		return static_cast<std::uint32_t>(p[0]) | (static_cast<std::uint32_t>(p[1]) << 8) |
		       (static_cast<std::uint32_t>(p[2]) << 16) | (static_cast<std::uint32_t>(p[3]) << 24);
	}

	void DecodeDxt1Block(const std::uint8_t block[8], std::uint8_t out[16][4])
	{
		const std::uint16_t c0 = static_cast<std::uint16_t>(block[0] | (block[1] << 8));
		const std::uint16_t c1 = static_cast<std::uint16_t>(block[2] | (block[3] << 8));
		auto expand565 = [](std::uint16_t c, std::uint8_t rgb[3]) {
			rgb[0] = static_cast<std::uint8_t>(((c >> 11) & 0x1F) * 255 / 31);
			rgb[1] = static_cast<std::uint8_t>(((c >> 5) & 0x3F) * 255 / 63);
			rgb[2] = static_cast<std::uint8_t>((c & 0x1F) * 255 / 31);
		};
		std::uint8_t colors[4][4]{};
		expand565(c0, colors[0]);
		colors[0][3] = 255;
		expand565(c1, colors[1]);
		colors[1][3] = 255;
		if (c0 > c1) {
			for (int i = 0; i < 3; ++i) {
				colors[2][i] = static_cast<std::uint8_t>((2 * colors[0][i] + colors[1][i]) / 3);
				colors[3][i] = static_cast<std::uint8_t>((colors[0][i] + 2 * colors[1][i]) / 3);
			}
			colors[2][3] = 255;
			colors[3][3] = 255;
		} else {
			for (int i = 0; i < 3; ++i) {
				colors[2][i] = static_cast<std::uint8_t>((colors[0][i] + colors[1][i]) / 2);
				colors[3][i] = 0;
			}
			colors[2][3] = 255;
			colors[3][3] = 0;
		}
		std::uint32_t indices = ReadU32(block + 4);
		for (int i = 0; i < 16; ++i) {
			const int idx = static_cast<int>((indices >> (2 * i)) & 0x3u);
			out[i][0] = colors[idx][2];  // B
			out[i][1] = colors[idx][1];  // G
			out[i][2] = colors[idx][0];  // R
			out[i][3] = colors[idx][3];  // A
		}
	}

	void DecodeDxt3Alpha(const std::uint8_t block[8], std::uint8_t alpha[16])
	{
		for (int i = 0; i < 8; ++i) {
			const std::uint8_t b = block[i];
			alpha[i * 2] = static_cast<std::uint8_t>((b & 0x0F) * 17);
			alpha[i * 2 + 1] = static_cast<std::uint8_t>(((b >> 4) & 0x0F) * 17);
		}
	}

	void DecodeDxt5Alpha(const std::uint8_t block[8], std::uint8_t alpha[16])
	{
		const std::uint8_t a0 = block[0];
		const std::uint8_t a1 = block[1];
		std::uint8_t palette[8]{ a0, a1 };
		if (a0 > a1) {
			for (int i = 1; i <= 6; ++i) {
				palette[i + 1] = static_cast<std::uint8_t>(((7 - i) * a0 + i * a1) / 7);
			}
		} else {
			for (int i = 1; i <= 4; ++i) {
				palette[i + 1] = static_cast<std::uint8_t>(((5 - i) * a0 + i * a1) / 5);
			}
			palette[6] = 0;
			palette[7] = 255;
		}
		std::uint64_t bits = 0;
		for (int i = 0; i < 6; ++i) {
			bits |= static_cast<std::uint64_t>(block[2 + i]) << (8 * i);
		}
		for (int i = 0; i < 16; ++i) {
			alpha[i] = palette[(bits >> (3 * i)) & 0x7u];
		}
	}

	bool DecodeDdsToBgra(
		const std::vector<std::uint8_t>& file,
		std::vector<std::uint8_t>& outBgra,
		std::uint32_t& width,
		std::uint32_t& height)
	{
		if (file.size() < 128 || std::memcmp(file.data(), "DDS ", 4) != 0) {
			return false;
		}
		const std::uint8_t* hdr = file.data();
		const std::uint32_t headerSize = ReadU32(hdr + 4);
		if (headerSize < 124) {
			return false;
		}
		height = ReadU32(hdr + 12);
		width = ReadU32(hdr + 16);
		if (width == 0 || height == 0 || width > 8192 || height > 8192) {
			return false;
		}

		const std::uint32_t pfFlags = ReadU32(hdr + 80);
		const char* fourCC = reinterpret_cast<const char*>(hdr + 84);
		const std::uint32_t rgbBits = ReadU32(hdr + 88);
		const std::uint32_t rMask = ReadU32(hdr + 92);
		const std::uint32_t gMask = ReadU32(hdr + 96);
		const std::uint32_t bMask = ReadU32(hdr + 100);
		const std::uint32_t aMask = ReadU32(hdr + 104);

		std::size_t dataOff = 128;
		bool isDx10 = std::memcmp(fourCC, "DX10", 4) == 0;
		std::uint32_t dxgiFormat = 0;
		if (isDx10) {
			if (file.size() < 148) {
				return false;
			}
			dxgiFormat = ReadU32(hdr + 128);
			dataOff = 148;
		}

		const bool hasFourCC = (pfFlags & 0x4u) != 0;
		outBgra.assign(static_cast<std::size_t>(width) * height * 4u, 0);

		auto maskShift = [](std::uint32_t mask) -> int {
			if (mask == 0) {
				return 0;
			}
			int shift = 0;
			while ((mask & 1u) == 0) {
				mask >>= 1;
				++shift;
			}
			return shift;
		};
		auto maskBits = [](std::uint32_t mask) -> int {
			int bits = 0;
			while (mask) {
				bits += static_cast<int>(mask & 1u);
				mask >>= 1;
			}
			return bits;
		};
		auto expand = [](std::uint32_t v, int bits) -> std::uint8_t {
			if (bits <= 0) {
				return 0;
			}
			if (bits >= 8) {
				return static_cast<std::uint8_t>(v & 0xFFu);
			}
			return static_cast<std::uint8_t>((v * 255u) / ((1u << bits) - 1u));
		};

		// Uncompressed RGB/RGBA (common for some iWant icons; WIC often rejects these).
		if (!hasFourCC && (pfFlags & 0x40u) != 0 && (rgbBits == 32 || rgbBits == 24)) {
			const int rShift = maskShift(rMask);
			const int gShift = maskShift(gMask);
			const int bShift = maskShift(bMask);
			const int aShift = maskShift(aMask);
			const int rBits = maskBits(rMask);
			const int gBits = maskBits(gMask);
			const int bBits = maskBits(bMask);
			const int aBits = maskBits(aMask);
			const std::size_t bpp = rgbBits / 8u;
			const std::size_t rowBytes = static_cast<std::size_t>(width) * bpp;
			const std::size_t need = dataOff + rowBytes * height;
			if (file.size() < need) {
				return false;
			}
			for (std::uint32_t y = 0; y < height; ++y) {
				const std::uint8_t* row = file.data() + dataOff + y * rowBytes;
				for (std::uint32_t x = 0; x < width; ++x) {
					std::uint32_t pixel = 0;
					std::memcpy(&pixel, row + x * bpp, bpp);
					const std::size_t o = (static_cast<std::size_t>(y) * width + x) * 4u;
					outBgra[o + 0] = expand((pixel & bMask) >> bShift, bBits);
					outBgra[o + 1] = expand((pixel & gMask) >> gShift, gBits);
					outBgra[o + 2] = expand((pixel & rMask) >> rShift, rBits);
					outBgra[o + 3] = aMask ? expand((pixel & aMask) >> aShift, aBits) : 255;
				}
			}
			return true;
		}

		enum class BlockFmt { Dxt1, Dxt3, Dxt5 };
		BlockFmt fmt{};
		bool haveFmt = false;
		if (isDx10) {
			// DXGI_FORMAT_BC1_UNORM=71, BC2=74, BC3=77 (and SRGB variants).
			if (dxgiFormat == 71 || dxgiFormat == 72) {
				fmt = BlockFmt::Dxt1;
				haveFmt = true;
			} else if (dxgiFormat == 74 || dxgiFormat == 75) {
				fmt = BlockFmt::Dxt3;
				haveFmt = true;
			} else if (dxgiFormat == 77 || dxgiFormat == 78) {
				fmt = BlockFmt::Dxt5;
				haveFmt = true;
			}
		} else if (hasFourCC) {
			if (std::memcmp(fourCC, "DXT1", 4) == 0) {
				fmt = BlockFmt::Dxt1;
				haveFmt = true;
			} else if (std::memcmp(fourCC, "DXT3", 4) == 0) {
				fmt = BlockFmt::Dxt3;
				haveFmt = true;
			} else if (std::memcmp(fourCC, "DXT5", 4) == 0) {
				fmt = BlockFmt::Dxt5;
				haveFmt = true;
			}
		}
		if (!haveFmt) {
			return false;
		}

		const std::uint32_t blocksX = (width + 3u) / 4u;
		const std::uint32_t blocksY = (height + 3u) / 4u;
		const std::size_t blockSize = (fmt == BlockFmt::Dxt1) ? 8u : 16u;
		const std::size_t need = dataOff + static_cast<std::size_t>(blocksX) * blocksY * blockSize;
		if (file.size() < need) {
			return false;
		}

		const std::uint8_t* src = file.data() + dataOff;
		for (std::uint32_t by = 0; by < blocksY; ++by) {
			for (std::uint32_t bx = 0; bx < blocksX; ++bx) {
				std::uint8_t alpha[16];
				std::uint8_t colorBlock[8];
				if (fmt == BlockFmt::Dxt1) {
					std::memcpy(colorBlock, src, 8);
					src += 8;
					for (int i = 0; i < 16; ++i) {
						alpha[i] = 255;
					}
				} else if (fmt == BlockFmt::Dxt3) {
					DecodeDxt3Alpha(src, alpha);
					std::memcpy(colorBlock, src + 8, 8);
					src += 16;
				} else {
					DecodeDxt5Alpha(src, alpha);
					std::memcpy(colorBlock, src + 8, 8);
					src += 16;
				}
				std::uint8_t pixels[16][4];
				DecodeDxt1Block(colorBlock, pixels);
				if (fmt != BlockFmt::Dxt1) {
					for (int i = 0; i < 16; ++i) {
						pixels[i][3] = alpha[i];
					}
				}
				for (int py = 0; py < 4; ++py) {
					for (int px = 0; px < 4; ++px) {
						const std::uint32_t x = bx * 4u + static_cast<std::uint32_t>(px);
						const std::uint32_t y = by * 4u + static_cast<std::uint32_t>(py);
						if (x >= width || y >= height) {
							continue;
						}
						const int i = py * 4 + px;
						const std::size_t o = (static_cast<std::size_t>(y) * width + x) * 4u;
						outBgra[o + 0] = pixels[i][0];
						outBgra[o + 1] = pixels[i][1];
						outBgra[o + 2] = pixels[i][2];
						outBgra[o + 3] = pixels[i][3];
					}
				}
			}
		}
		return true;
	}

	bool DecodeDdsFileToPng(const std::filesystem::path& src, const std::filesystem::path& dstPng)
	{
		std::ifstream in(src, std::ios::binary);
		if (!in) {
			return false;
		}
		std::vector<std::uint8_t> file(
			(std::istreambuf_iterator<char>(in)), std::istreambuf_iterator<char>());
		std::vector<std::uint8_t> bgra;
		std::uint32_t width = 0;
		std::uint32_t height = 0;
		if (!DecodeDdsToBgra(file, bgra, width, height)) {
			return false;
		}

		HRESULT coHr = CoInitializeEx(nullptr, COINIT_MULTITHREADED);
		const bool needUninit = SUCCEEDED(coHr) || coHr == RPC_E_CHANGED_MODE || coHr == S_FALSE;
		ComPtr<IWICImagingFactory> factory;
		HRESULT hr = CoCreateInstance(
			CLSID_WICImagingFactory, nullptr, CLSCTX_INPROC_SERVER, IID_PPV_ARGS(&factory));
		bool ok = false;
		if (SUCCEEDED(hr) && factory) {
			std::error_code ec;
			std::filesystem::create_directories(dstPng.parent_path(), ec);
			ok = EncodePngFromBgra(factory.Get(), bgra.data(), width, height, dstPng);
		}
		if (needUninit && SUCCEEDED(coHr)) {
			CoUninitialize();
		}
		return ok;
	}

	bool DecodeWithWicToPng(const std::filesystem::path& src, const std::filesystem::path& dstPng)
	{
		HRESULT coHr = CoInitializeEx(nullptr, COINIT_MULTITHREADED);
		const bool needUninit = SUCCEEDED(coHr) || coHr == RPC_E_CHANGED_MODE || coHr == S_FALSE;

		ComPtr<IWICImagingFactory> factory;
		HRESULT hr = CoCreateInstance(
			CLSID_WICImagingFactory,
			nullptr,
			CLSCTX_INPROC_SERVER,
			IID_PPV_ARGS(&factory));
		if (FAILED(hr) || !factory) {
			if (needUninit && SUCCEEDED(coHr)) {
				CoUninitialize();
			}
			return false;
		}

		ComPtr<IWICBitmapDecoder> decoder;
		hr = factory->CreateDecoderFromFilename(
			ToWide(src).c_str(),
			nullptr,
			GENERIC_READ,
			WICDecodeMetadataCacheOnDemand,
			&decoder);
		if (FAILED(hr) || !decoder) {
			if (needUninit && SUCCEEDED(coHr)) {
				CoUninitialize();
			}
			return false;
		}

		ComPtr<IWICBitmapFrameDecode> frame;
		hr = decoder->GetFrame(0, &frame);
		bool ok = false;
		if (SUCCEEDED(hr) && frame) {
			std::error_code ec;
			std::filesystem::create_directories(dstPng.parent_path(), ec);
			ok = EncodePngFromWicFrame(factory.Get(), frame.Get(), dstPng);
		}

		if (needUninit && SUCCEEDED(coHr)) {
			CoUninitialize();
		}
		return ok;
	}
}

namespace CogIconImport
{
	std::string ImportFromDataPath(std::string sourceMod, std::string iconName, std::string dataRelPath)
	{
		if (dataRelPath.empty()) {
			logger::warn(
				"COG ImportIcon failed: empty path (mod='{}' icon='{}')",
				sourceMod,
				iconName);
			return {};
		}

		std::replace(dataRelPath.begin(), dataRelPath.end(), '\\', '/');
		while (!dataRelPath.empty() && (dataRelPath.front() == '/' || dataRelPath.front() == '\\')) {
			dataRelPath.erase(dataRelPath.begin());
		}
		if (dataRelPath.find("..") != std::string::npos) {
			logger::warn(
				"COG ImportIcon failed: path escapes Data (mod='{}' icon='{}' path='{}')",
				sourceMod,
				iconName,
				dataRelPath);
			return {};
		}

		const auto data = DataRoot();
		std::filesystem::path requested = data;
		for (auto part : std::filesystem::path(dataRelPath)) {
			if (part == "." || part.empty()) {
				continue;
			}
			if (part == "..") {
				logger::warn(
					"COG ImportIcon failed: path escapes Data (mod='{}' icon='{}' path='{}')",
					sourceMod,
					iconName,
					dataRelPath);
				return {};
			}
			requested /= part;
		}

		if (PathEscapesData(requested, data)) {
			logger::warn(
				"COG ImportIcon failed: path outside Data (mod='{}' icon='{}' path='{}')",
				sourceMod,
				iconName,
				dataRelPath);
			return {};
		}

		if (!FileReadable(requested)) {
			logger::warn(
				"COG ImportIcon failed: missing source {} (mod='{}' icon='{}')",
				requested.string(),
				sourceMod,
				iconName);
			return {};
		}

		const auto ext = LowerExt(requested);
		const auto modTok = SanitizeToken(sourceMod);
		const auto nameTok = SanitizeToken(iconName);

		std::filesystem::path outDir =
			data / "PrismaUI" / "views" / "COG" / "assets" / "imports" / "icons" / modTok;
		std::filesystem::path outFile;
		std::string rel;

		if (IsCopyAsIs(ext)) {
			outFile = outDir / (nameTok + ext);
			rel = modTok + "/" + nameTok + ext;
			// Idempotent: destination already present (common under MO2 overwrite) — reuse it.
			if (!FileReadable(outFile) && !CopyFileTo(requested, outFile)) {
				logger::warn(
					"COG ImportIcon failed: copy {} -> {} (mod='{}' icon='{}')",
					requested.string(),
					outFile.string(),
					sourceMod,
					iconName);
				return {};
			}
		} else if (ext == ".dds") {
			outFile = outDir / (nameTok + ".png");
			rel = modTok + "/" + nameTok + ".png";
			if (!FileReadable(outFile)) {
				const bool ddsOk = DecodeDdsFileToPng(requested, outFile);
				const bool wicOk = ddsOk || DecodeWithWicToPng(requested, outFile);
				if (!ddsOk && !wicOk) {
					logger::warn(
						"COG ImportIcon failed: DDS decode {} (mod='{}' icon='{}')",
						requested.string(),
						sourceMod,
						iconName);
					return {};
				}
			}
		} else if (!ext.empty()) {
			outFile = outDir / (nameTok + ".png");
			rel = modTok + "/" + nameTok + ".png";
			if (!FileReadable(outFile) && !DecodeWithWicToPng(requested, outFile)) {
				logger::warn(
					"COG ImportIcon failed: WIC decode {} (mod='{}' icon='{}')",
					requested.string(),
					sourceMod,
					iconName);
				return {};
			}
		} else {
			logger::warn(
				"COG ImportIcon failed: unknown extension on {} (mod='{}' icon='{}')",
				requested.string(),
				sourceMod,
				iconName);
			return {};
		}

		std::replace(rel.begin(), rel.end(), '\\', '/');
		logger::info(
			"COG ImportIcon -> {} (mod='{}' icon='{}' from '{}')",
			rel,
			sourceMod,
			iconName,
			dataRelPath);
		return rel;
	}
}

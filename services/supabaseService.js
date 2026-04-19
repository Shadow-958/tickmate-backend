// backend/services/supabaseService.js - SHOULD EXIST

const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

const uploadFile = async (fileBuffer, fileName, folder = 'events', bucket = 'event-images') => {
  try {
    const timestamp = Date.now();
    const randomString = Math.random().toString(36).substring(2, 15);
    const fileExt = fileName.split('.').pop();
    const uniqueFileName = `${folder}/${timestamp}-${randomString}.${fileExt}`;

    console.log(`📤 Uploading file to Supabase: ${uniqueFileName}`);

    const { data, error } = await supabase.storage
      .from(bucket)
      .upload(uniqueFileName, fileBuffer, {
        contentType: getContentType(fileExt),
        upsert: false
      });

    if (error) {
      throw new Error(`Upload failed: ${error.message}`);
    }

    const { data: urlData } = supabase.storage
      .from(bucket)
      .getPublicUrl(uniqueFileName);

    console.log(`✅ File uploaded successfully: ${urlData.publicUrl}`);

    return {
      success: true,
      url: urlData.publicUrl,
      path: uniqueFileName
    };

  } catch (error) {
    console.error('❌ Supabase upload error:', error);
    return {
      success: false,
      error: error.message
    };
  }
};

const deleteFile = async (filePath, bucket = 'event-images') => {
  try {
    console.log(`🗑️ Deleting file from Supabase: ${filePath}`);

    const { error } = await supabase.storage
      .from(bucket)
      .remove([filePath]);

    if (error) {
      throw new Error(`Delete failed: ${error.message}`);
    }

    console.log(`✅ File deleted successfully`);
    return { success: true };

  } catch (error) {
    console.error('❌ Supabase delete error:', error);
    return {
      success: false,
      error: error.message
    };
  }
};

const getContentType = (fileExt) => {
  const contentTypes = {
    'jpg': 'image/jpeg',
    'jpeg': 'image/jpeg',
    'png': 'image/png',
    'gif': 'image/gif',
    'webp': 'image/webp',
    'svg': 'image/svg+xml'
  };
  
  return contentTypes[fileExt.toLowerCase()] || 'application/octet-stream';
};

module.exports = {
  supabase,
  uploadFile,
  deleteFile
};

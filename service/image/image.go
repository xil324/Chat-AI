package image

import (
	"GopherAI/common/image"
	"fmt"
	"io"
	"log"
	"mime/multipart"
	"os"
)


func RecognizeImage(file *multipart.FileHeader) (string, error) {

	modelPath := os.Getenv("IMAGE_MODEL_PATH")
	if modelPath == "" {
		return "", fmt.Errorf("IMAGE_MODEL_PATH environment variable is not set")
	}

	labelPath := os.Getenv("IMAGE_LABEL_PATH")
	if labelPath == "" {
		return "", fmt.Errorf("IMAGE_LABEL_PATH environment variable is not set")
	}

	// Verify files exist
	if _, err := os.Stat(modelPath); os.IsNotExist(err) {
		return "", fmt.Errorf("model file does not exist: %s", modelPath)
	}
	if _, err := os.Stat(labelPath); os.IsNotExist(err) {
		return "", fmt.Errorf("label file does not exist: %s", labelPath)
	}

	inputH, inputW := 224, 224


	recognizer, err := image.NewImageRecognizer(modelPath, labelPath, inputH, inputW)
	if err != nil {
		log.Printf("NewImageRecognizer failed: modelPath=%s, labelPath=%s, error=%v", modelPath, labelPath, err)
		return "", fmt.Errorf("failed to initialize image recognizer: %w", err)
	}
	defer recognizer.Close()

	src, err := file.Open()
	if err != nil {
		log.Println("file open fail err is : ", err)
		return "", err
	}
	defer src.Close()

	buf, err := io.ReadAll(src)
	if err != nil {
		log.Println("io.ReadAll fail err is : ", err)
		return "", err
	}


	return recognizer.PredictFromBuffer(buf)
}

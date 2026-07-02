import torch
from PIL import Image
from torchvision import transforms
from sklearn.metrics.pairwise import cosine_similarity

from model import SiameseNetwork


device = torch.device(
    "cuda" if torch.cuda.is_available() else "cpu"
)

transform = transforms.Compose([
    transforms.Resize((224, 224)),
    transforms.ToTensor()
])


def load_model(model_path="saved_models/siamese_model.pth"):
    """
    Load a trained Siamese model.
    """

    model = SiameseNetwork().to(device)

    model.load_state_dict(
        torch.load(
            model_path,
            map_location=device
        )
    )

    model.eval()

    return model


def get_embedding(image_path, model):
    """
    Generate embedding for an image.
    """

    image = Image.open(image_path)
    try:
        resample = Image.Resampling.BILINEAR if hasattr(Image, 'Resampling') else Image.BILINEAR
        image.thumbnail((512, 512), resample)
    except Exception:
        pass
    image = image.convert("RGB")

    tensor = transform(image).unsqueeze(0).to(device)

    with torch.no_grad():
        embedding = model.encoder(tensor)

    return embedding.cpu().numpy()


def compare_images(image1_path, image2_path, model):
    """
    Compare two images and return similarity percentage.
    """

    embedding1 = get_embedding(image1_path, model)
    embedding2 = get_embedding(image2_path, model)

    similarity = cosine_similarity(
        embedding1,
        embedding2
    )[0][0]

    score = ((similarity + 1) / 2) * 100

    return score
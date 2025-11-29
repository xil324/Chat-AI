# Chat-AI Platform (Go + React)

## 📖 Overview

**Chat-AI** is a robust, full-stack Web Application Platform designed to provide intelligent services including AI-powered conversation and image recognition. 

Built with performance in mind, the backend utilizes **Golang (Gin)** for high-concurrency request handling, while the frontend offers a modern, responsive user experience using **React**. The system leverages **RabbitMQ** for asynchronous message processing and **ONNX Runtime** for efficient, local AI inference.

🔗 **Repository:** [https://github.com/xil324/Chat-AI/tree/main](https://github.com/xil324/Chat-AI/tree/main)

---

## ✨ Key Features

* **🔐 User Authentication:** Secure Login and Registration system with Email Verification and JWT Token management.
* **💬 Intelligent Chat:** Integration with **Gemini** and **Ollama** LLMs to provide context-aware AI responses.
* **👁️ Image Recognition:** Built-in Computer Vision capabilities using the **MobileNetV2** model (via ONNX Runtime) to classify uploaded images.
* **⚡ High Performance:** Uses RabbitMQ for message decoupling and asynchronous processing to prevent main thread blocking.
* **🗄️ Scalable Data:** Utilizes MongoDB for flexible data storage and Redis for efficient caching.

---

## 🛠 Tech Stack

| Component | Technology | Description |
| :--- | :--- | :--- |
| **Frontend** | **React** | SPA architecture for a responsive UI. |
| **Backend** | **Go (Golang)** | High-performance compiled language. |
| **Web Framework** | **Gin** | Lightweight and fast HTTP web framework. |
| **Database** | **MongoDB** | NoSQL database for flexible data storage. |
| **Cache** | **Redis** | Used for caching verification codes and session tokens. |
| **Message Queue** | **RabbitMQ** | Handles asynchronous tasks and traffic peak shaving. |
| **AI / LLM** | **Gemini / Ollama** | Large Language Models for chat capabilities. |
| **Inference** | **ONNX Runtime** | Runs MobileNetV2 for image classification. |

---

## 📸 Project Screenshots

### 1. Authentication
Secure entry points with email verification support.

<img width="300" height="583" alt="Screenshot 2025-11-28 at 18 04 54" src="https://github.com/user-attachments/assets/cad8be93-1f07-4f56-a1eb-7a9e00599634" />
<img width="300" height="689" alt="Screenshot 2025-11-28 at 18 04 59" src="https://github.com/user-attachments/assets/34d4972a-b4d5-45d1-b7c6-10dbc32db4c9" />
 

### 2. Dashboard & Navigation
A clean, centralized hub to access different AI services.

<img width="300" height="560" alt="image" src="https://github.com/user-attachments/assets/271196dc-7e88-45cc-b510-fdbb6ffb8963" />


### 3. AI Chat Interface
Interact with Gemini/Ollama. The system supports context retention for coherent conversations.

<img width="500" height="634" alt="Screenshot 2025-11-28 at 18 07 54" src="https://github.com/user-attachments/assets/d027b7b2-698c-4de4-a5bb-0951dd1055f8" />


### 4. Image Recognition Service
Upload images to get instant classification results using the local ONNX inference engine.

<img width="500" height="881" alt="Screenshot 2025-11-28 at 18 08 11" src="https://github.com/user-attachments/assets/a4c59612-3d12-474f-93af-90de7b4754d8" />


---

## 🏗 System Architecture

The system is designed with a layered architecture to ensure scalability and maintainability:

1.  **Router & Controller:** Defines RESTful API groups (`/user`, `/chat`, `/image`) and handles parameter binding and response formatting.
2.  **Service Layer:** Encapsulates core business logic (e.g., JWT generation, calling LLM providers, running ONNX models).
3.  **DAO Layer:** Manages data persistence using **MongoDB**.
4.  **Middleware:** JWT authentication middleware ensures secure API access.
5.  **Asynchronous Processing:** Chat messages are pushed to **RabbitMQ** for background processing, ensuring the UI remains responsive.

### 2. AI Integration Strategy (Factory Pattern)
To support multiple AI providers (Gemini, Ollama) and allow for easy future expansion, the project implements the **Factory Design Pattern** within the `common/aihelper` module. 

This architecture decouples the business logic from specific LLM implementations.

```mermaid
classDiagram
    direction LR
    class AIHelperInterface {
        <<Interface>>
        +SendMessage(ctx, message)
    }

    class AIFactory {
        +CreateAIHelper(providerType) AIHelperInterface
    }

    class GeminiClient {
        +SendMessage()
    }

    class OllamaClient {
        +SendMessage()
    }

    %% Relationships
    ServiceLayer ..> AIFactory : Requests Client
    AIFactory ..> AIHelperInterface : Returns
    GeminiClient ..|> AIHelperInterface : Implements
    OllamaClient ..|> AIHelperInterface : Implements
```
Because of the Factory pattern, adding a new provider (e.g., ChatGPT) requires zero changes to the core business logic. You only need to touch the common/aihelper package:
- Create the Struct: Create a new file (e.g., chatgpt_client.go) and define a struct that holds the necessary config (API Key, URL).
- Implement Interface: Ensure your struct implements the SendMessage method defined in the global interface.
- Register in the Factory

#### A. Redis: Authentication & Caching
We use **Redis** (in-memory key-value store) to handle short-lived, high-access security data. This reduces load on the primary database and speeds up authentication.

1.  **Email Verification (OTP):** When a user registers, the verification code is stored in Redis with a 5-minute Expiration (TTL).
2.  **Session Management:** User Tokens are cached to allow for quick validation and "blocklisting" capabilities.

```mermaid
sequenceDiagram
    participant User
    participant API as Go Backend
    participant Redis
    participant DB as MongoDB

    Note over User, Redis: 1. Registration Flow
    User->>API: Request Register (Email)
    API->>Redis: Store OTP (TTL: 300s)
    API-->>User: Send Email Code
    User->>API: Submit Code
    API->>Redis: Validate & Delete OTP
    
    Note over User, Redis: 2. Login Flow
    User->>API: Login (User/Pass)
    API->>DB: Check Credentials
    API->>Redis: Cache User Token
    API-->>User: Return JWT
```

#### B.RabbitMQ: Asynchronous & High Concurrency
Interacting with Large Language Models (LLMs) can be slow. If we processed these requests synchronously, the web server would block, leading to timeouts under high traffic.
We use RabbitMQ to decouple the request from the processing:
- Producer: The Web Server accepts the chat request, pushes it to the Queue, and immediately returns a "Processing" status to the UI.
- Consumer: A background Go routine picks up the message, calls the slow AI API, and updates the database when finished.
```mermaid
graph LR
    Client[Client UI] -- HTTP Request --> API[Gin Web Server]
    
    subgraph Synchronous Path
    API -- Fast Response --> Client
    end
    
    subgraph Asynchronous Path
    API -- 1. Push Message --> Queue[(RabbitMQ Queue)]
    Queue -- 2. Consume --> Worker[Background Worker]
    Worker -- 3. Slow API Call --> LLM[Gemini/Ollama]
    Worker -- 4. Save Result --> MongoDB[(MongoDB)]
    end
    
    style Queue fill:#f9f,stroke:#333
    style Worker fill:#bbf,stroke:#333
```
---

## 🚀 Getting Started

Follow these steps to set up the project locally.

### Prerequisites
Ensure you have the following installed and running on your machine:
* **Go** (version 1.21 or higher)
* **Node.js** & **npm**
* **MongoDB** (Running on default port or configured in env)
* **Redis**
* **RabbitMQ**

### Backend Setup

1.  **Clone the repository**
    ```bash
    git clone [https://github.com/xil324/Chat-AI.git](https://github.com/xil324/Chat-AI.git)
    cd Chat-AI
    ```

2.  **Install Go Dependencies**
    ```bash
    go mod tidy
    ```

3.  **Configure Environment**
    Create a configuration file (or `.env` file) based on the example provided in the repo. Ensure you set your API keys:
    ```env
    MONGO_URI=mongodb://localhost:27017
    REDIS_ADDR=localhost:6379
    RABBITMQ_URL=amqp://guest:guest@localhost:5672/
    GEMINI_API_KEY=your_api_key_here
    ```

4.  **Run the Server**
    ```bash
    ./start-servers.sh
    ```

### Frontend Setup

1.  **Navigate to the frontend directory**
    ```bash
    cd react-frontend
    ```

2.  **Install Dependencies**
    ```bash
    npm install
    ```

3.  **Start the React App**
    ```bash
    npm start
    ```
    The application should now be accessible at `http://localhost:3000`.

---


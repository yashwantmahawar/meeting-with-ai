#!/bin/bash

echo "========================================================"
echo "🚀 Starting Setup for AI Meeting MOM Generator..."
echo "========================================================"

# 1. Check and create virtual environment
if [ ! -d "venv" ]; then
    echo "📦 Creating Python virtual environment (venv)..."
    python3 -m venv venv
    if [ $? -ne 0 ]; then
        echo "❌ Failed to create virtual environment. Make sure python3 is installed."
        exit 1
    fi
else
    echo "✅ Virtual environment already exists."
fi

# 2. Activate virtual environment
echo "🔄 Activating virtual environment..."
source venv/bin/activate

# 3. Install dependencies
echo "📥 Installing dependencies from requirements.txt..."
pip install -r requirements.txt
if [ $? -ne 0 ]; then
    echo "❌ Failed to install dependencies."
    exit 1
fi
echo "✅ Dependencies installed."

# 4. Check for .env file and prompt if missing
if [ ! -f ".env" ]; then
    echo "⚙️  .env file not found. Let's set it up!"
    
    # Prompt for PORT
    read -p "Enter PORT to run the server on [default: 8000]: " PORT_INPUT
    PORT_INPUT=${PORT_INPUT:-8000}
    
    # Write to .env
    echo "PORT=$PORT_INPUT" > .env
    echo "✅ Created .env file and saved settings."
else
    echo "✅ .env file already exists."
fi

# 5. Run the server
echo "========================================================"
echo "🌟 Starting the Flask server..."
echo "========================================================"
python3 server.py

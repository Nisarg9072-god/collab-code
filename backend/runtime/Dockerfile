
FROM ubuntu:22.04

# Avoid interactive prompts
ENV DEBIAN_FRONTEND=noninteractive

# Install basic utilities
RUN apt-get update && apt-get install -y \
    curl \
    git \
    bash \
    build-essential

# Install Node.js (LTS)
RUN curl -fsSL https://deb.nodesource.com/setup_lts.x | bash - \
    && apt-get install -y nodejs

# Install Python 3 and pip
RUN apt-get install -y python3 python3-pip

# Install Go (latest stable)
RUN curl -fsSL https://golang.org/dl/go1.22.0.linux-amd64.tar.gz | tar -C /usr/local -xz \
    && ln -s /usr/local/go/bin/go /usr/local/bin/go

# Set up a non-root user
RUN useradd -m -s /bin/bash user
USER user
WORKDIR /home/user/workspace

# Set a default command
CMD ["/bin/bash"]
